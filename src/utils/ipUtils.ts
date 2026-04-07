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
  
  // Based on user requirement: 
  // The first .0 in the range's first C-block is the network address.
  // The last .255 in the range's last C-block is the broadcast address.
  // This handles ranges like 192.168.1.2 - 192.168.2.254 where 1.0 is network and 2.255 is broadcast.
  
  const startParts = startIP.split('.');
  const endParts = endIP.split('.');
  
  const networkIP = `${startParts[0]}.${startParts[1]}.${startParts[2]}.0`;
  const broadcastIP = `${endParts[0]}.${endParts[1]}.${endParts[2]}.255`;
  
  const network = ipToLong(networkIP);
  const broadcast = ipToLong(broadcastIP);
  
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
