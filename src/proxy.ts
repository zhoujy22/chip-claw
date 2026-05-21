import { Agent, ProxyAgent, setGlobalDispatcher } from "undici";
import type { Dispatcher } from "undici";

let configuredProxy: string | undefined;

const DEFAULT_PORTS: Record<string, number> = {
  "http:": 80,
  "https:": 443,
};

interface ProxyConfig {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy: string;
}

class EnvProxyDispatcher {
  private readonly directAgent = new Agent();
  private readonly httpProxyAgent?: ProxyAgent;
  private readonly httpsProxyAgent?: ProxyAgent;

  constructor(private readonly config: ProxyConfig) {
    if (config.httpProxy) {
      this.httpProxyAgent = new ProxyAgent(config.httpProxy);
    }
    if (config.httpsProxy) {
      this.httpsProxyAgent = new ProxyAgent(config.httpsProxy);
    } else {
      this.httpsProxyAgent = this.httpProxyAgent;
    }
  }

  dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandlers): boolean {
    return this.getDispatcher(options.origin).dispatch(options, handler);
  }

  async close(): Promise<void> {
    await Promise.all(this.dispatchers().map((dispatcher) => dispatcher.close()));
  }

  async destroy(error?: Error | null): Promise<void> {
    await Promise.all(this.dispatchers().map((dispatcher) => dispatcher.destroy(error ?? null)));
  }

  private dispatchers(): Dispatcher[] {
    return Array.from(new Set([
      this.directAgent,
      this.httpProxyAgent,
      this.httpsProxyAgent,
    ].filter((dispatcher): dispatcher is Dispatcher => !!dispatcher)));
  }

  private getDispatcher(origin?: string | URL): Dispatcher {
    if (!origin) return this.directAgent;

    let url: URL;
    try {
      url = origin instanceof URL ? origin : new URL(origin);
    } catch {
      return this.directAgent;
    }

    if (shouldBypassProxy(url, this.config.noProxy)) return this.directAgent;
    if (url.protocol === "https:") return this.httpsProxyAgent || this.directAgent;
    if (url.protocol === "http:") return this.httpProxyAgent || this.directAgent;
    return this.directAgent;
  }
}

function getProxyConfig(): ProxyConfig | undefined {
  const httpProxy = process.env.http_proxy || process.env.HTTP_PROXY;
  const httpsProxy = process.env.https_proxy || process.env.HTTPS_PROXY || httpProxy;
  if (!httpProxy && !httpsProxy) return undefined;

  return {
    httpProxy,
    httpsProxy,
    noProxy: process.env.no_proxy || process.env.NO_PROXY || "",
  };
}

function shouldBypassProxy(url: URL, noProxy: string): boolean {
  const entries = noProxy.split(/[,\s]+/).filter(Boolean);
  if (entries.length === 0) return false;
  if (entries.includes("*")) return true;

  const hostname = url.hostname.toLowerCase();
  const port = Number.parseInt(url.port, 10) || DEFAULT_PORTS[url.protocol] || 0;

  return entries.some((entry) => {
    const parsed = entry.match(/^(.+):(\d+)$/);
    const pattern = (parsed ? parsed[1] : entry).toLowerCase();
    const entryPort = parsed ? Number.parseInt(parsed[2], 10) : 0;

    if (entryPort && entryPort !== port) return false;
    if (pattern.startsWith("*")) return hostname.endsWith(pattern.slice(1));
    if (pattern.startsWith(".")) {
      const domain = pattern.slice(1);
      return hostname === domain || hostname.endsWith(pattern);
    }
    return hostname === pattern || hostname.endsWith(`.${pattern}`);
  });
}

export function configureEnvProxy(): string | undefined {
  if (configuredProxy) return configuredProxy;

  const config = getProxyConfig();
  if (!config) return undefined;

  setGlobalDispatcher(new EnvProxyDispatcher(config) as unknown as Dispatcher);
  configuredProxy = config.httpsProxy || config.httpProxy;
  return configuredProxy;
}
