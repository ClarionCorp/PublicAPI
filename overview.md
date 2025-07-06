## Layout Overview
Just a nice file to keep everything in check.

- Core
  - Designed for internal helpers.
  - Functions for endpoints to use.

- Plugins
  - These are regular functions that several endpoints rely on to work.
  - (Logger, cron, prisma, etc.)

- Routes
  - These are the actual endpoints provided publicly.

- Types
  - For typescript casting.
  - For dictionaries.