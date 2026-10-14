/* eslint-disable @typescript-eslint/no-require-imports */
const childProcess = require("node:child_process");

const originalExec = childProcess.exec;

childProcess.exec = function sandboxAwareExec(command, options, callback) {
  if (command === "net use") {
    const done = typeof options === "function" ? options : callback;
    queueMicrotask(() => done?.(new Error("net use disabled in sandbox"), "", ""));
    return undefined;
  }

  return originalExec.apply(this, arguments);
};
