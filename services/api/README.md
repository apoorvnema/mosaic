# services/api

Empty on purpose. The sync relay, identity and blob storage are built in the sync
session (Prompt 4): Hono on Node, Postgres, S3-compatible storage, docker-compose
for self-hosting. The relay stores opaque Yjs updates and never parses note content.
