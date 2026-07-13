// "Run now" entry point. Spawned detached by the run-now API route as
// `tsx workers/orchestrator/run-task.ts <taskGid>`. Runs one explicit task
// immediately (a long run can't live inside the HTTP request) and reports the
// result back to the app queue over HTTP.
import { runSingle } from './orchestrator';
import { appendHistory, releaseLock } from './status';

const gid = process.argv[2];

if (!gid) {
  console.error('Usage: run-task.ts <asanaTaskGid>');
  process.exitCode = 1;
} else {
  runSingle(gid)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(async error => {
      console.error(error instanceof Error ? error.stack || error.message : error);
      try {
        await appendHistory({
          ranAt: new Date().toISOString(),
          taskGid: gid,
          title: null,
          finalStatus: 'failed',
          summary: error instanceof Error ? error.message : String(error),
        });
        await releaseLock();
      } catch {
        // ignore secondary failures
      }
      process.exitCode = 1;
    });
}
