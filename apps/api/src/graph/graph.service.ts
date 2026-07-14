import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import 'isomorphic-fetch';
import { AppConfig } from '../config/configuration';

/* Default Entra security-group → appRole mapping (§3). Override per group id
   via the admin import call. */
export const DEFAULT_GROUP_ROLE_MAP: Record<string, string> = {
  'SG-Appraisal-Employees': 'Appraisal.Employee',
  'SG-IT-Managers': 'Appraisal.Manager.IT',
  'SG-Exec-IT': 'Appraisal.Exec.CIO',
  'SG-Exec-Finance': 'Appraisal.Exec.CFO',
  'SG-Exec': 'Appraisal.Exec.MD',
  'SG-App-Admins': 'Appraisal.Admin',
};

export interface GraphMember {
  entraObjectId: string;
  upn: string;
  email: string;
  displayName: string;
  department?: string;
  jobTitle?: string;
}

@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);
  private client?: Client;

  constructor(private readonly config: ConfigService) {}

  private cfg(): AppConfig {
    return this.config.get<AppConfig>('app')!;
  }

  /** True when real Graph credentials are configured. */
  get isLive(): boolean {
    const c = this.cfg();
    return c.authMode === 'entra' && !!c.entra.tenantId && !!c.entra.clientId && !!c.entra.clientSecret;
  }

  private getClient(): Client {
    if (this.client) return this.client;
    const { tenantId, clientId, clientSecret } = this.cfg().entra;
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });
    this.client = Client.initWithMiddleware({ authProvider });
    return this.client;
  }

  /** Fetch transitive members of an Entra security group. */
  async getGroupMembers(groupId: string): Promise<GraphMember[]> {
    const client = this.getClient();
    const members: GraphMember[] = [];
    let res = await client
      .api(`/groups/${groupId}/transitiveMembers/microsoft.graph.user`)
      .select('id,userPrincipalName,mail,displayName,department,jobTitle')
      .top(100)
      .get();
    const collect = (page: any) => {
      for (const u of page.value ?? []) {
        members.push({
          entraObjectId: u.id,
          upn: u.userPrincipalName,
          email: u.mail ?? u.userPrincipalName,
          displayName: u.displayName ?? u.userPrincipalName,
          department: u.department ?? undefined,
          jobTitle: u.jobTitle ?? undefined,
        });
      }
    };
    collect(res);
    while (res['@odata.nextLink']) {
      res = await client.api(res['@odata.nextLink']).get();
      collect(res);
    }
    return members;
  }

  /** Look up a group's displayName (for labeling). */
  async getGroupName(groupId: string): Promise<string> {
    const client = this.getClient();
    const g = await client.api(`/groups/${groupId}`).select('displayName').get();
    return g.displayName ?? groupId;
  }

  /** Send a branded email via Graph sendMail. Returns the message id (or null in simulation). */
  async sendMail(to: string, subject: string, htmlBody: string): Promise<string | null> {
    if (!this.isLive) {
      this.logger.log(`[SIMULATED MAIL] to=${to} subject="${subject}"`);
      return null;
    }
    const sender = this.cfg().graph.senderUpn;
    const client = this.getClient();
    await client.api(`/users/${sender}/sendMail`).post({
      message: {
        subject,
        body: { contentType: 'HTML', content: htmlBody },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    });
    // Graph sendMail returns 202 with no body; we don't get a message id back.
    return 'sent';
  }
}
