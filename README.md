# ClarionCorp's OS API
In 2025, we completely rewrote the backend of the ClarionCorp Stats website. This is now available to the public at [api.clarioncorp.net](https://api.clarioncorp.net), and can be read upon at [docs.clarioncorp.net](https://docs.clarioncorp.net).

Some endpoints require authentication, which can be acquired by reaching out via email or [discord](https://clarioncorp.net/discord). These are permanent tokens that are super simple to use, and grant you access to more endpoints. We just do this to prevent spam, and are more than happy to provide tokens for small and large projects. You can read more about using authentication tokens [here](https://docs.clarioncorp.net/FAQ/authentication).


# Common Questions
1. Contrary to popular belief, we do not have ties to Odyssey in any way, and most of the services we provide can be accessed directly via the Official [Prometheus Proxy](https://docs.clarioncorp.net/category/prometheus-proxy). This is just for people who wish not deal with rotating api keys and database queries.

2. No we do not have access to the stats of ongoing games or **match history**. Aesop has confirmed that he queries the OS database directly on [Omega Stats](https://stats.omegastrikers.gg/), and that is not something we have access to. *(Though we would love that Mr. Sop)*

3. Yes we are completely fine with clearing name history for the owners of accounts. For now, just shoot `dsit` a direct message on discord.


# Building From Source
For any contributors that wish to get this running locally for development testing, just follow these steps.
1. Clone this repo.
2. Setup a postgres database locally, and give a user all privileges to it.
3. Run `cp .env.example .env` then open `.env` with `nano` and fill out the empty strings.
4. Run `pnpm i` to install packages.
5. Run `pnpm regen` to sync Prisma with Postgres.
6. Run `pnpm build` then `pnpm start` to build and start.

We don't have any sort of live "dev" mode so for now, use `pnpm dev` to quickly build and start the server in one go, then just `CTRL + C` to exit.