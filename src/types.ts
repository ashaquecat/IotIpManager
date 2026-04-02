export interface IPPool {
  id?: string;
  name: string;
  vlan: string;
  startIP: string;
  endIP: string;
  gatewayIP: string;
  subnetMask: string;
  ouId: string;
  remarks: string;
  totalCount: number;
  usedCount: number;
}

export interface IPAddress {
  id?: string;
  ip: string;
  poolId: string;
  status: 'used' | 'unused';
  ouId: string;
  accountId?: string;
}

export interface TerminalAccount {
  id?: string;
  accountName: string;
  ip: string;
  mac?: string;
  ouId: string;
  applicant: string;
  safetyOfficer: string;
  remarks: string;
  password: string;
}

export interface OrganizationUnit {
  id?: string;
  name: string;
  code: string;
}
