interface IWsOpts {
  path: string;
  headers: string;
}

export interface IProxy {
  name: string;
  type: string;
  server: string;
  port: number;
  udp?: boolean;
  sni?: string;
  network: string;
  'ws-opts': IWsOpts;
}

export interface ITrojanProxy extends IProxy {
  password: string;
}

export interface IVmessProxy extends IProxy {
  uuid: string;
}

export type ProxyType = ITrojanProxy | IVmessProxy;
