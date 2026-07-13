// Pacer entry point. Invoked by launchd / the `orchestrator:run` npm script via
// `tsx workers/orchestrator/run.ts`. Each tick budget-gates then drains at most
// one queued delegation entry. Kept thin so orchestrator.ts stays import-safe
// for the Jest tests.
import { drainOnce } from './orchestrator';
import { appendHistory, releaseLock } from './status';

drainOnce()
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(async error => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    // Best-effort: record the failure and release the lock so we don't wedge.
    try {
      await appendHistory({
        ranAt: new Date().toISOString(),
        taskGid: null,
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
