import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import chalk from 'chalk';

const loggerPlugin: FastifyPluginAsync = async (fastify) => {
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

export default fp(loggerPlugin);
