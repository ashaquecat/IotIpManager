export function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

export function longToIp(long: number): string {
  return [
    (long >>> 24) & 0xff,
    (long >>> 16) & 0xff,
    (long >>> 8) & 0xff,
    long & 0xff,
  ].join('.');
}

export function calculateUsableIPs(startIP: string, endIP: string, gatewayIP: string, subnetMask: string): string[] {
  const start = ipToLong(startIP);
  const end = ipToLong(endIP);
  const gateway = ipToLong(gatewayIP);
  const mask = ipToLong(subnetMask);
  
  const network = (start & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  
  const ips: string[] = [];
  for (let i = start; i <= end; i++) {
    // Exclude network address, broadcast address, and gateway
    if (i !== network && i !== broadcast && i !== gateway) {
      ips.push(longToIp(i));
    }
  }
  return ips;
}

export function generatePassword(length: number = 12): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let retVal = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
}
