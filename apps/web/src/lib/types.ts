export type Role = 'appraisee' | 'it_manager' | 'cto' | 'cio' | 'cfo' | 'md' | 'admin';

export interface Me {
  id: string;
  upn: string;
  email: string;
  displayName: string;
  department?: string | null;
  org?: string | null;
  roles: Role[];
  appRoles: string[];
  nav: { key: string; label: string }[];
}

export interface Field { id: string; label: string; order: number }
export interface Section { id: string; title: string; type: string; weight: number; order: number; fields: Field[] }
export interface Template {
  id: string; name: string; scope: string; system: boolean;
  icon?: string; color?: string; desc?: string; sections: Section[];
}

export interface Signature { id: string; party: 'employee' | 'manager'; name: string; account: string; ip?: string; signedAt: string }

export interface Appraisal {
  id: string;
  employeeId: string; managerId?: string | null; templateId: string; cycleId?: string | null;
  status: string; managerReviewDone: boolean; signed: boolean;
  employeeSelf?: { ratings?: Record<string, number>; texts?: Record<string, string>; goals?: any[] };
  managerReview?: { ratings?: Record<string, number>; sectionComments?: Record<string, string> };
  employeeScore?: number; managerScore?: number;
  finalCommentEmployee?: string; finalCommentManager?: string;
  completionPct?: number;
  submittedAt?: string; decidedAt?: string;
  employee?: any; manager?: any; template?: Template; cycle?: any;
  signatures?: Signature[];
}

export interface Notification {
  id: string; kind: string; subject: string; body?: string; preview?: string;
  toUserId?: string; toEmail?: string; read: boolean; graphMessageId?: string; sentAt: string;
}

export interface AuditEvent {
  id: string; ts: string; actorId?: string; actorName?: string; action: string;
  objectRef?: string; sourceIp?: string; result: string; prevHash?: string; hash: string;
}

export interface Cycle {
  id: string; name: string; scope: string; status: string; targetDate?: string; closed: boolean;
  steps: { id: string; label: string; dueDate?: string; state: string; order: number }[];
  participants: { id: string; userId: string; team?: string; dueDate?: string; extended: boolean }[];
}

export interface DevUser { upn: string; displayName: string; department?: string; roles: Role[] }
