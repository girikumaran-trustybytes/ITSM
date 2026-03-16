import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: "backend/.env" });

const run = async (): Promise<void> => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const queues = await client.query(
      "SELECT queue_id, queue_key, queue_label FROM ticket_queues ORDER BY queue_id"
    );
    console.log("Queues:", queues.rows);
    const seq = await client.query("SELECT last_value, is_called FROM ticket_queues_queue_id_seq");
    console.log("Seq:", seq.rows);
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
