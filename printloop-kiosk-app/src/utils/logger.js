"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const config_1 = require("../config");
const transport = config_1.config.logging.pretty
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
    }
    : undefined;
exports.logger = (0, pino_1.default)({
    level: config_1.config.logging.level,
    transport,
    base: { service: 'printloop-kiosk' },
});
//# sourceMappingURL=logger.js.map