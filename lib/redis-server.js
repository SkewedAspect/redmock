'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

var _messageParser = require('./message-parser');

var _messageParser2 = _interopRequireDefault(_messageParser);

var _commandProcessor = require('./command-processor');

var _commandProcessor2 = _interopRequireDefault(_commandProcessor);

var _sentinelCommandProcessor = require('./sentinel-command-processor');

var _sentinelCommandProcessor2 = _interopRequireDefault(_sentinelCommandProcessor);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const debug = require('debug')('redmock:redis-server');

const defaultOpts = {
  port: 6379,
  sentinelPort: 26379
};

/**
 * Implement a mock Redis server for unit testing.
 */
class RedisServer {

  /**
   * Constructor.
   * @constructor
   */
  constructor(opts) {
    opts = opts || {
      port: 6379,
      sentinelPort: 26379
    };
    this.opts = opts;
    this.messageParser = new _messageParser2.default();
    this.commandProcessor = new _commandProcessor2.default();
    this.sentinelCommandProcessor = new _sentinelCommandProcessor2.default(this.opts.port);
    this.connections = [];
    this.sentinelConnections = [];
  }

  /**
   * Start the server and begin listening.
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = _net2.default.createServer(this.handleNewConnection.bind(this));

      // Handle an error from listen
      this.server.once('error', err => {
        this.server.removeAllListeners('error');
        reject(err);
      });

      // We are listening
      this.server.once('listening', () => {
        this.server.removeAllListeners('error');

        // Now let's start a sentinel server
        this.sentinelServer = _net2.default.createServer(this.handleSentinelConnection.bind(this));

        // Handle an error from listen
        this.sentinelServer.once('error', err => {
          this.sentinelServer.removeAllListeners('error');
          reject(err);
        });

        // We are listening
        this.sentinelServer.once('listening', () => {
          this.sentinelServer.removeAllListeners('error');
          debug('Server started');
          resolve(true);
        });

        this.sentinelServer.listen(this.opts.sentinelPort);
      });

      this.server.listen(this.opts.port);
    });
  }

  /**
   * Stop the server.
   */
  stop() {
    return new Promise((resolve, reject) => {
      if (this.server) {
        debug('Stopping server');
        for (let connection of this.connections) {
          connection.destroy();
        }
        for (let connection of this.sentinelConnections) {
          connection.destroy();
        }
        this.server.close(err => {
          if (this.sentinelServer) {
            this.sentinelServer.close(err => {
              resolve(true);
            });
          } else {
            resolve(true);
          }
        });
      } else {
        resolve(true);
      }
    });
  }

  /**
   * Handle new connetion.
   */
  handleNewConnection(socket) {
    debug('New redis connection from: ' + socket.remoteAddress + ':' + socket.remotePort);
    socket.database = '0';
    this.connections.push(socket);
    socket.on('data', data => {
      let commands = this.messageParser.getCommands(data);
      for (let command of commands) {
        debug('Command is', command);
        this.commandProcessor.process(this.messageParser.parse(command), socket);
      }
    });
  }

  /**
   * Handle sentinel connection.
   */
  handleSentinelConnection(socket) {
    debug('New sentinel connection from: ' + socket.remoteAddress + ':' + socket.remotePort);
    this.sentinelConnections.push(socket);
    socket.on('data', data => {
      this.sentinelCommandProcessor.process(this.messageParser.parse(data), socket);
    });
  }

}
exports.default = RedisServer;