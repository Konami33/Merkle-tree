const config = require('../config/app');

const levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

const currentLevel = levels[config.LOG_LEVEL] || levels.info;

function formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ') : '';
    
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
}

function log(level, message, ...args) {
    if (levels[level] <= currentLevel) {
        const formattedMessage = formatMessage(level, message, ...args);
        
        if (level === 'error') {
            console.error(formattedMessage);
        } else if (level === 'warn') {
            console.warn(formattedMessage);
        } else {
            console.log(formattedMessage);
        }
    }
}

function error(message, ...args) {
    log('error', message, ...args);
}

function warn(message, ...args) {
    log('warn', message, ...args);
}

function info(message, ...args) {
    log('info', message, ...args);
}

function debug(message, ...args) {
    log('debug', message, ...args);
}

module.exports = {
    error,
    warn,
    info,
    debug
};