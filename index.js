let Service, Characteristic
const axios = require('axios')
const packageJson = require('./package.json')

module.exports = function (homebridge) {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  homebridge.registerAccessory('homebridge-http-lock', 'HTTPLock', HTTPLock)
}

function HTTPLock (log, config) {
  this.log = log
  this.config = config

  // Essential configuration validation
  if (!config.name) {
    throw new Error('Device name must be specified in configuration')
  }
  if (!config.openURL && !config.closeURL) {
    throw new Error('At least one endpoint URL (openURL or closeURL) is required')
  }

  this.name = config.name

  // Hardware identification properties
  this.manufacturer = config.manufacturer || packageJson.author
  this.serial = config.serial || packageJson.version
  this.model = config.model || packageJson.name
  this.firmware = config.firmware || packageJson.version

  // Network authentication settings
  this.username = config.username || null
  this.password = config.password || null
  this.timeout = (config.timeout * 1000) || 5000
  this.http_method = config.http_method || 'GET'

  // Endpoint configuration for lock operations
  this.openURL = config.openURL
  this.openBody = config.openBody || ''
  this.openHeader = config.openHeader || {}
  this.closeURL = config.closeURL
  this.closeBody = config.closeBody || ''
  this.closeHeader = config.closeHeader || {}

  // Automated lock behavior settings
  this.autoLock = config.autoLock || false
  this.autoLockDelay = config.autoLockDelay || 5
  
  // State synchronization options
  this.resetLock = config.resetLock || false
  this.resetLockTime = config.resetLockTime || 5

  // HTTP client configuration setup
  this.axiosConfig = {
    timeout: this.timeout,
    validateStatus: function (status) {
      return status >= 200 && status < 300
    }
  }

  if (this.username && this.password) {
    this.axiosConfig.auth = {
      username: this.username,
      password: this.password
    }
  }

  this.log.info(`Lock device "${this.name}" initialized using ${this.http_method} method`)

  this.service = new Service.LockMechanism(this.name)
  
  // Timer reference for automatic operations
  this.autoLockTimeout = null
}

HTTPLock.prototype = {

  identify: function (callback) {
    this.log.info('HomeKit identification request received')
    callback()
  },

  _httpRequest: async function (url, headers = {}, body = '', method = 'GET') {
    if (!url) {
      throw new Error('Request URL cannot be empty')
    }

    const config = {
      ...this.axiosConfig,
      url: url,
      method: method,
      headers: {
        'User-Agent': `${packageJson.name}/${packageJson.version}`,
        ...headers
      }
    }

    // Configure request payload for methods that support body data
    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && body) {
      if (typeof body === 'string') {
        config.data = body
      } else {
        config.data = JSON.stringify(body)
        config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/json'
      }
    }

    try {
      this.log.debug(`Sending ${method} request to endpoint: ${url}`)
      const response = await axios(config)
      this.log.debug(`HTTP request completed successfully with status: ${response.status}`)
      return response
    } catch (error) {
      if (error.response) {
        // Server returned an error response
        this.log.error(`Server error ${error.response.status} ${error.response.statusText} from ${url}`)
        throw new Error(`Server responded with ${error.response.status}: ${error.response.statusText}`)
      } else if (error.request) {
        // Network or connectivity issue
        this.log.error(`Network connectivity failed for ${url}: ${error.message}`)
        throw new Error(`Connection failed: ${error.message}`)
      } else {
        // Client-side configuration problem
        this.log.error(`Request setup failed: ${error.message}`)
        throw new Error(`Configuration error: ${error.message}`)
      }
    }
  },

  setLockTargetState: function (value, callback) {
    this.log.info(`Processing lock state change request: ${value ? 'SECURE' : 'UNLOCK'}`)
    
    let url, body, headers
    
    if (value === Characteristic.LockTargetState.SECURED) {
      url = this.closeURL
      body = this.closeBody
      headers = this.closeHeader
    } else {
      url = this.openURL
      body = this.openBody
      headers = this.openHeader
    }

    if (!url) {
      const action = value === Characteristic.LockTargetState.SECURED ? 'secure' : 'unlock'
      const error = new Error(`No endpoint configured for ${action} operation`)
      this.log.error(error.message)
      return callback(error)
    }

    // Cancel any pending automatic lock operation
    if (this.autoLockTimeout) {
      clearTimeout(this.autoLockTimeout)
      this.autoLockTimeout = null
    }

    this._httpRequest(url, headers, body, this.http_method)
      .then(() => {
        if (value === Characteristic.LockTargetState.SECURED) {
          this.service.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.SECURED)
          this.log.info('Lock mechanism secured successfully')
        } else {
          this.service.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.UNSECURED)
          this.log.info('Lock mechanism unlocked successfully')
          
          // Execute post-unlock automation if configured
          if (this.autoLock) {
            this.autoLockFunction()
          } else if (this.resetLock) {
            this.resetLockFunction()
          }
        }
        callback()
      })
      .catch((error) => {
        this.log.error(`Lock operation failed: ${error.message}`)
        callback(error)
      })
  },

  autoLockFunction: function () {
    this.log.info(`Automatic lock scheduled to execute in ${this.autoLockDelay} seconds`)
    
    this.autoLockTimeout = setTimeout(() => {
      this.log.info('Executing automatic lock sequence')
      this.service.setCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED)
      this.autoLockTimeout = null
    }, this.autoLockDelay * 1000)
  },
  
  resetLockFunction: function () {
    this.log.info(`Lock state will reset to secured in ${this.resetLockTime} seconds`)
    
    setTimeout(() => {
      this.log.info('Resetting lock state to secured position')
      this.service.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED)
      this.service.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED)
    }, this.resetLockTime * 1000)
  },

  getServices: function () {
    // Set initial lock state to secured position
    this.service.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.SECURED)
    this.service.setCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED)

    // Configure device information service
    this.informationService = new Service.AccessoryInformation()
    this.informationService
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.serial)
      .setCharacteristic(Characteristic.FirmwareRevision, this.firmware)

    // Bind lock control event handlers
    this.service
      .getCharacteristic(Characteristic.LockTargetState)
      .on('set', this.setLockTargetState.bind(this))

    return [this.informationService, this.service]
  }
}
