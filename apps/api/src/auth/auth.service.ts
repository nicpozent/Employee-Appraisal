import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { AuthUser } from './current-user';
import { mapEntraRoles } from './roles';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private jwks?: JwksClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private cfg(): AppConfig {
    return this.config.get<AppConfig>('app')!;
  }

  get authMode(): 'entra' | 'mock' {
    return this.cfg().authMode;
  }

  /** Resolve an AuthUser from an incoming request's Authorization header / dev header. */
  async resolve(req: any): Promise<AuthUser> {
    if (this.authMode === 'entra') {
      return this.resolveEntra(req);
    }
    return this.resolveMock(req);
  }

  // ── Entra ID (production) ──────────────────────────────────────────────
  private async resolveEntra(req: any): Promise<AuthUser> {
    const auth = req.headers['authorization'] as string | undefined;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    const token = auth.slice(7);
    const { tenantId, apiAudience } = this.cfg().entra;

    if (!this.jwks) {
      this.jwks = new JwksClient({
        jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
        cache: true,
        rateLimit: true,
      });
    }

    const decoded = await new Promise<any>((resolve, reject) => {
      jwt.verify(
        token,
        (header, cb) => {
          this.jwks!.getSigningKey(header.kid!, (err, key) => {
            if (err) return cb(err);
            cb(null, key!.getPublicKey());
          });
        },
        {
          audience: apiAudience,
          issuer: [
            `https://login.microsoftonline.com/${tenantId}/v2.0`,
            `https://sts.windows.net/${tenantId}/`,
          ],
          algorithms: ['RS256'],
        },
        (err, payload) => (err ? reject(err) : resolve(payload)),
      );
    }).catch((e) => {
      this.logger.warn(`Token validation failed: ${e.message}`);
      throw new UnauthorizedException('Invalid token');
    });

    const appRoles: string[] = decoded.roles ?? [];
    const user = await this.syncUser({
      entraObjectId: decoded.oid,
      upn: decoded.preferred_username ?? decoded.upn ?? decoded.email,
      email: decoded.email ?? decoded.preferred_username,
      displayName: decoded.name ?? decoded.preferred_username,
      appRoles,
    });
    return this.toAuthUser(user, appRoles);
  }

  // ── Dev mock (no live tenant) ─────────────────────────────────────────
  private async resolveMock(req: any): Promise<AuthUser> {
    // Dev session carried in a simple header: `x-dev-upn`.
    const upn =
      (req.headers['x-dev-upn'] as string | undefined) ||
      (this.parseBearerUpn(req.headers['authorization'] as string | undefined));
    if (!upn) throw new UnauthorizedException('No dev session (x-dev-upn header required in mock mode)');
    const user = await this.prisma.user.findUnique({ where: { upn } });
    if (!user) throw new UnauthorizedException(`Unknown dev user: ${upn}`);
    return this.toAuthUser(user, user.appRoles);
  }

  private parseBearerUpn(auth?: string): string | undefined {
    if (!auth?.startsWith('Bearer dev:')) return undefined;
    return auth.slice('Bearer dev:'.length);
  }

  private async syncUser(claims: {
    entraObjectId?: string;
    upn: string;
    email?: string;
    displayName?: string;
    appRoles: string[];
  }) {
    return this.prisma.user.upsert({
      where: { upn: claims.upn },
      update: {
        entraObjectId: claims.entraObjectId,
        email: claims.email ?? claims.upn,
        displayName: claims.displayName ?? claims.upn,
        appRoles: claims.appRoles,
        lastSignIn: new Date(),
      },
      create: {
        entraObjectId: claims.entraObjectId,
        upn: claims.upn,
        email: claims.email ?? claims.upn,
        displayName: claims.displayName ?? claims.upn,
        appRoles: claims.appRoles,
        lastSignIn: new Date(),
      },
    });
  }

  private toAuthUser(user: any, appRoles: string[]): AuthUser {
    return {
      id: user.id,
      entraObjectId: user.entraObjectId,
      upn: user.upn,
      email: user.email,
      displayName: user.displayName,
      org: user.org,
      department: user.department,
      managerId: user.managerId,
      appRoles,
      roles: mapEntraRoles(appRoles),
    };
  }
}
