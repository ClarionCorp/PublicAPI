import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import chalk from 'chalk';

const routeLogger: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (req) => {
    (req as any).startTime = process.hrtime();
  });

  fastify.addHook('onResponse', async (req, res) => {
    const [s, ns] = process.hrtime((req as any).startTime);
    const duration = (s * 1e3 + ns / 1e6).toFixed(1);

    const method = req.raw.method ?? 'GET';
    const url = req.raw.url ?? '';
    const status = res.statusCode;
    const time = chalk.gray(`[${new Date().toLocaleTimeString()}]`);

    const statusColor =
      status >= 500 ? chalk.red
      : status >= 400 ? chalk.yellow
      : status >= 300 ? chalk.cyan
      : chalk.green;

    const methodColor = {
      GET: chalk.greenBright,
      POST: chalk.yellow,
      PUT: chalk.blueBright,
      PATCH: chalk.magentaBright,
      DELETE: chalk.redBright,
    }[method] || chalk.white;

    console.log(
      `${time} ${methodColor(method)} ${chalk.white(url)} ${statusColor(status)} ${chalk.gray(`(${duration}ms)`)}`
    );
  });
};

export default fp(routeLogger);


export type LogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error';

// in ascending order of “loudness”
const levels: LogLevel[] = ['verbose', 'debug', 'info', 'warn', 'error'];

const levelColor: Record<LogLevel, (txt: string) => string> = {
  verbose: chalk.magenta,
  debug:   chalk.gray,
  info:    chalk.cyan,
  warn:    chalk.yellow,
  error:   chalk.red,
};

export function appLogger(name: string, minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'debug') {
  const prefix = `[${name}]`;
  const minIndex = levels.indexOf(minLevel);

  const log = (level: LogLevel, message: any, ...args: any[]) => {
    if (levels.indexOf(level) < minIndex) return;        // filtered out

    const tag = levelColor[level] (`[${level.toUpperCase()}]`);
    console.log(`${chalk.gray(prefix)} ${tag}`, message, ...args);
  };

  return {
    verbose: (msg: any, ...a: any[]) => log('verbose', msg, ...a),
    debug:   (msg: any, ...a: any[]) => log('debug',   msg, ...a),
    info:    (msg: any, ...a: any[]) => log('info',    msg, ...a),
    warn:    (msg: any, ...a: any[]) => log('warn',    msg, ...a),
    error:   (msg: any, ...a: any[]) => log('error',   msg, ...a),
  };
}