let Service, Characteristic
const axios = require('axios')
const packageJson = require('./package.json')

module.exports = function (homebridge) {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  homebridge.registerPlatform('@350d/homebridge-http-lock', 'HTTPLock', HTTPLockPlatform)
}

function HTTPLockPlatform (log, config, api) {
  this.log = log
  this.config = config
  this.api = api
  this.accessories = []

  // Essential for Child Bridge support
  this.Service = Service
  this.Characteristic = Characteristic

  if (api) {
    // Handle Homebridge restart and shutdown events
    this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this))
    this.api.on('shutdown', this.shutdown.bind(this))
  }
}

HTTPLockPlatform.prototype = {
  
  didFinishLaunching: function () {
    this.log.info('🚀 Platform initialization complete - discovering lock devices')
    
    // Platform format with multiple locks only
    if (this.config.locks && Array.isArray(this.config.locks) && this.config.locks.length > 0) {
      this.config.locks.forEach((lockConfig, index) => {
        this.addLockAccessory(lockConfig, index)
      })
    } else {
      this.log.error('❌ No lock devices configured! Please add at least one lock in the "locks" array.')
      return
    }

    this.log.info(`🎉 Platform setup complete with ${this.accessories.length} lock device(s)`)
  },

  addLockAccessory: function (lockConfig, index) {
    // Validate essential configuration parameters
    if (!lockConfig.name) {
      this.log.error(`❌ Lock device ${index + 1}: name is required`); return
    }
    if (!lockConfig.openURL && !lockConfig.closeURL) {
      this.log.error(`❌ Lock device "${lockConfig.name}": at least one URL (openURL or closeURL) is required`); return
    }

    const uuid = this.api.hap.uuid.generate(lockConfig.name + index)
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      this.log.info(`🔄 Updating existing lock device: ${lockConfig.name}`)
      existingAccessory.context.config = lockConfig
      new HTTPLockAccessory(this.log, lockConfig, this.api, existingAccessory)
    } else {
      this.log.info(`➕ Adding new lock device: ${lockConfig.name}`)
      const accessory = new this.api.platformAccessory(lockConfig.name, uuid)
      accessory.context.config = lockConfig
      new HTTPLockAccessory(this.log, lockConfig, this.api, accessory)
      this.api.registerPlatformAccessories('@350d/homebridge-http-lock', 'HTTPLock', [accessory])
      this.accessories.push(accessory)
    }
  },

  configureAccessory: function (accessory) {
    this.log.info(`📱 Loading cached lock device: ${accessory.displayName}`)
    this.accessories.push(accessory)
  },

  shutdown: function () {
    this.log.info('🛑 Platform shutdown initiated - cleaning up resources')
    
    // Clean up any running timers
    this.accessories.forEach(accessory => {
      if (accessory.lockAccessory && accessory.lockAccessory.autoLockTimeout) {
        clearTimeout(accessory.lockAccessory.autoLockTimeout)
      }
    })
  }
}

function HTTPLockAccessory (log, config, api, accessory) {
  this.log = log
  this.config = config
  this.api = api
  this.accessory = accessory

  // Store reference for cleanup
  this.accessory.lockAccessory = this

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

  this.log.info(`⚙️ Lock device "${this.name}" configured using ${this.http_method} method`)

  // Timer reference for automatic operations
  this.autoLockTimeout = null

  this.setupServices()
}

HTTPLockAccessory.prototype = {

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
      this.log.debug(`🌐 Sending ${method} request to endpoint: ${url}`)
      const response = await axios(config)
      this.log.debug(`✅ HTTP request completed successfully with status: ${response.status}`)
      return response
    } catch (error) {
      if (error.response) {
        // Server returned an error response
        this.log.error(`🚫 Server error ${error.response.status} ${error.response.statusText} from ${url}`)
        throw new Error(`Server responded with ${error.response.status}: ${error.response.statusText}`)
      } else if (error.request) {
        // Network or connectivity issue
        this.log.error(`📡 Network connectivity failed for ${url}: ${error.message}`)
        throw new Error(`Connection failed: ${error.message}`)
      } else {
        // Client-side configuration problem
        this.log.error(`⚙️ Request setup failed: ${error.message}`)
        throw new Error(`Configuration error: ${error.message}`)
      }
    }
  },

  setLockTargetState: function (value, callback) {
    const action = value ? 'SECURE 🔒' : 'UNLOCK 🔓'
    this.log.info(`🎯 Processing lock state change request: ${action}`)
    
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
      const operation = value === Characteristic.LockTargetState.SECURED ? 'secure' : 'unlock'
      const error = new Error(`No endpoint configured for ${operation} operation`)
      this.log.error(`❌ ${error.message}`)
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
          this.lockService.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.SECURED)
          this.log.info('🔒 Lock mechanism secured successfully')
        } else {
          this.lockService.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.UNSECURED)
          this.log.info('🔓 Lock mechanism unlocked successfully')
          
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
        this.log.error(`❌ Lock operation failed: ${error.message}`)
        callback(error)
      })
  },

  autoLockFunction: function () {
    this.log.info(`⏰ Automatic lock scheduled to execute in ${this.autoLockDelay} seconds`)
    
    this.autoLockTimeout = setTimeout(() => {
      this.log.info('🔄 Executing automatic lock sequence')
      this.lockService.setCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED)
      this.autoLockTimeout = null
    }, this.autoLockDelay * 1000)
  },
  
  resetLockFunction: function () {
    this.log.info(`⏱️ Lock state will reset to secured in ${this.resetLockTime} seconds`)
    
    setTimeout(() => {
      this.log.info('🔄 Resetting lock state to secured position')
      this.lockService.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED)
      this.lockService.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED)
    }, this.resetLockTime * 1000)
  },

  setupServices: function () {
    // Configure device information service
    this.informationService = this.accessory.getService(Service.AccessoryInformation)
    if (!this.informationService) {
      this.informationService = this.accessory.addService(Service.AccessoryInformation)
    }

    this.informationService
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.serial)
      .setCharacteristic(Characteristic.FirmwareRevision, this.firmware)

    // Setup lock mechanism service
    this.lockService = this.accessory.getService(Service.LockMechanism)
    if (!this.lockService) {
      this.lockService = this.accessory.addService(Service.LockMechanism, this.name)
    }

    // Set initial lock state to secured position
    this.lockService.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.SECURED)
    this.lockService.setCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED)

    // Bind lock control event handlers
    this.lockService
      .getCharacteristic(Characteristic.LockTargetState)
      .on('set', this.setLockTargetState.bind(this))
  }
}
