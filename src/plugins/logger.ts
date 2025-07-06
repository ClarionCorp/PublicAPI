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


type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function appLogger(name: string) {
  const prefix = `[${name}]`;

  const log = (level: LogLevel, message: any, ...args: any[]) => {
    const colorMap = {
      debug: '\x1b[90m', // gray
      info: '\x1b[36m',  // cyan
      warn: '\x1b[33m',  // yellow
      error: '\x1b[31m', // red
    };

    const reset = '\x1b[0m';
    console.log(`${colorMap[level]}${prefix} [${level.toUpperCase()}]${reset} ${message}`, ...args);
  };

  return {
    debug: (msg: any, ...a: any[]) => log('debug', msg, ...a),
    info: (msg: any, ...a: any[]) => log('info', msg, ...a),
    warn: (msg: any, ...a: any[]) => log('warn', msg, ...a),
    error: (msg: any, ...a: any[]) => log('error', msg, ...a),
  };
}