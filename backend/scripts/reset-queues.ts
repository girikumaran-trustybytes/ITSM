import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: "backend/.env" });

type QueueSeed = {
  id: number;
  key: string;
  label: string;
};

const defaultQueues: QueueSeed[] = [
  { id: 1, key: "support", label: "Support Team" },
  { id: 2, key: "hr", label: "HR Team" },
  { id: 3, key: "management", label: "Management" },
];

const run = async (): Promise<void> => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM role_permissions WHERE permission_id IN (SELECT permission_id FROM permissions WHERE permission_key LIKE 'ticket:%')"
    );
    await client.query(
      "DELETE FROM template_permissions WHERE permission_id IN (SELECT permission_id FROM permissions WHERE permission_key LIKE 'ticket:%')"
    );
    await client.query(
      "DELETE FROM user_permissions_override WHERE permission_id IN (SELECT permission_id FROM permissions WHERE permission_key LIKE 'ticket:%')"
    );
    await client.query("DELETE FROM permissions WHERE permission_key LIKE 'ticket:%'");
    await client.query("DELETE FROM ticket_queue_actions");
    await client.query("DELETE FROM ticket_queues");

    for (const q of defaultQueues) {
      await client.query(
        "INSERT INTO ticket_queues (queue_id, queue_key, queue_label) VALUES ($1, $2, $3)",
        [q.id, q.key, q.label]
      );
    }

    await client.query("SELECT setval('ticket_queues_queue_id_seq', 3, true)");
    await client.query("SELECT setval('ticket_queue_actions_action_id_seq', 1, false)");
    await client.query("COMMIT");
    console.log("Queues reset and reseeded (IDs 1-3).");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
