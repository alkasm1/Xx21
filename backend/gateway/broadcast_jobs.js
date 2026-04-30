// gateway/broadcast_jobs.js

const eventBus = require("./event_bus");

let JOB_ID = 1;

class BroadcastJobs {
  constructor() {
    this.jobs = new Map(); // jobId -> job
  }

  create({ groupId, commandId, deviceIds }) {
    const jobId = JOB_ID++;

    const job = {
      jobId,
      groupId,
      commandId,
      total: deviceIds.length,
      ok: 0,
      fail: 0,
      timeout: 0,
      pending: new Set(deviceIds),
      results: {} // deviceId -> status
    };

    this.jobs.set(jobId, job);

    eventBus.emit("broadcast.job.created", job);

    return job;
  }

  markOK(job, deviceId) {
    if (!job.pending.has(deviceId)) return;

    job.pending.delete(deviceId);
    job.ok++;
    job.results[deviceId] = "OK";

    this._update(job);
  }

  markFAIL(job, deviceId) {
    if (!job.pending.has(deviceId)) return;

    job.pending.delete(deviceId);
    job.fail++;
    job.results[deviceId] = "FAIL";

    this._update(job);
  }

  markTIMEOUT(job, deviceId) {
    if (!job.pending.has(deviceId)) return;

    job.pending.delete(deviceId);
    job.timeout++;
    job.results[deviceId] = "TIMEOUT";

    this._update(job);
  }

  _update(job) {
    eventBus.emit("broadcast.job.update", job);

    if (job.pending.size === 0) {
      eventBus.emit("broadcast.job.done", job);
    }
  }

  get(jobId) {
    return this.jobs.get(jobId);
  }
}

const broadcastJobs = new BroadcastJobs();

module.exports = { broadcastJobs };
