import process from "node:process";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const stderrLogger: Logger = {
  info: (message) => process.stderr.write(`${message}\n`),
  warn: (message) => process.stderr.write(`warning: ${message}\n`),
  error: (message) => process.stderr.write(`error: ${message}\n`),
};
