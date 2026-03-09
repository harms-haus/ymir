import * as log from 'loglevel';

const logger = log.getLogger('ymir');
logger.setLevel((import.meta.env.VITE_LOG_LEVEL as log.LogLevelDesc) || 'WARN');

export default logger;
export const createLogger = (name: string) => {
  const child = log.getLogger(name);
  child.setLevel(logger.getLevel());
  return child;
};
