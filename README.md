# Homebridge HTTP Lock

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Modern Homebridge plugin that transforms any HTTP-enabled device into a smart lock for Apple HomeKit. Perfect for IoT devices, web-controlled relays, and custom automation systems.

## Key Features

- **HTTP Protocol Support**: Works with any device accepting HTTP requests
- **Multiple HTTP Methods**: GET, POST, PUT, PATCH support for maximum compatibility  
- **Secure Authentication**: Built-in HTTP Basic Authentication
- **Flexible Headers & Payloads**: Complete control over request formatting
- **Smart Auto-Lock**: Configurable automatic re-locking functionality
- **State Synchronization**: Reset lock status without triggering actions
- **Robust Error Handling**: Comprehensive logging and error management
- **Future-Proof**: Full compatibility with Homebridge 1.9+ and 2.0+

## System Requirements

- **Homebridge**: Version 1.6.0 or newer (including 2.0.0-beta)
- **Node.js**: 18.20.4+, 20.15.1+, or 22+
- **iOS/macOS**: HomeKit-enabled device with iOS 13.0+

## Installation Guide

Install through Homebridge UI or command line:

```bash
npm install -g @350d/homebridge-http-lock
```

## Configuration Examples

Add the accessory configuration to your Homebridge `config.json`:

### Simple Setup (GET Requests)

```json
{
  "accessories": [
    {
      "accessory": "HTTPLock",
      "name": "Front Door Lock",
      "openURL": "http://192.168.1.100/relay/0?turn=on",
      "closeURL": "http://192.168.1.100/relay/0?turn=off"
    }
  ]
}
```

### Advanced Setup (POST with Authentication)

```json
{
  "accessories": [
    {
      "accessory": "HTTPLock",
      "name": "Smart Lock",
      "http_method": "POST",
      "timeout": 10,
      "username": "admin",
      "password": "password",
      "openURL": "https://your-device.local/api/unlock",
      "openHeader": {
        "Content-Type": "application/json",
        "X-API-Key": "your-api-key"
      },
      "openBody": {
        "action": "unlock",
        "device_id": "lock_01"
      },
      "closeURL": "https://your-device.local/api/lock",
      "closeHeader": {
        "Content-Type": "application/json",
        "X-API-Key": "your-api-key"
      },
      "closeBody": {
        "action": "lock",
        "device_id": "lock_01"
      },
      "autoLock": true,
      "autoLockDelay": 30
    }
  ]
}
```

### State Reset Configuration

Ideal for devices that automatically return to locked state:

```json
{
  "accessories": [
    {
      "accessory": "HTTPLock",
      "name": "Gate Lock",
      "openURL": "http://192.168.1.100/trigger",
      "resetLock": true,
      "resetLockTime": 5
    }
  ]
}
```

## Configuration Reference

### Essential Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `accessory` | string | Must be `HTTPLock` |
| `name` | string | Device name displayed in HomeKit |

**Note**: Either `openURL` or `closeURL` (or both) must be configured.

### HTTP Endpoints & Actions

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `openURL` | string | - | HTTP endpoint for unlock operation |
| `closeURL` | string | - | HTTP endpoint for lock operation |
| `openHeader` | object | `{}` | Custom headers for unlock requests |
| `closeHeader` | object | `{}` | Custom headers for lock requests |
| `openBody` | string/object | `""` | Request payload for unlock operation |
| `closeBody` | string/object | `""` | Request payload for lock operation |

### Network & Authentication

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `http_method` | string | `GET` | HTTP method (`GET`, `POST`, `PUT`, `PATCH`) |
| `timeout` | number | `5` | Request timeout in seconds |
| `username` | string | - | HTTP Basic Auth username |
| `password` | string | - | HTTP Basic Auth password |

### Automation Features

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `autoLock` | boolean | `false` | Enable automatic re-locking after unlock |
| `autoLockDelay` | number | `5` | Delay before auto-lock in seconds |
| `resetLock` | boolean | `false` | Reset state to locked without HTTP call |
| `resetLockTime` | number | `5` | Delay before state reset in seconds |

**Important**: `autoLock` and `resetLock` are mutually exclusive. `autoLock` triggers the `closeURL`, while `resetLock` only updates HomeKit state.

### Device Identification

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `manufacturer` | string | `350d` | Device manufacturer name |
| `model` | string | Plugin name | Device model identifier |
| `serial` | string | Plugin version | Device serial number |
| `firmware` | string | Plugin version | Firmware version string |

## Real-World Examples

### Shelly 1 Relay Control

```json
{
  "accessory": "HTTPLock",
  "name": "Garage Door",
  "openURL": "http://192.168.1.50/relay/0?turn=on",
  "closeURL": "http://192.168.1.50/relay/0?turn=off",
  "resetLock": true,
  "resetLockTime": 3
}
```

### ESP8266/ESP32 Integration

```json
{
  "accessory": "HTTPLock",
  "name": "Garden Gate",
  "http_method": "POST",
  "openURL": "http://esp-gate.local/api/control",
  "openHeader": {
    "Content-Type": "application/json"
  },
  "openBody": {
    "command": "open",
    "duration": 1000
  },
  "resetLock": true,
  "resetLockTime": 5
}
```

### Cloud API Integration

```json
{
  "accessory": "HTTPLock",
  "name": "Office Door",
  "http_method": "POST",
  "timeout": 15,
  "openURL": "https://api.smartlock.com/v1/locks/12345/unlock",
  "closeURL": "https://api.smartlock.com/v1/locks/12345/lock",
  "openHeader": {
    "Authorization": "Bearer your-token-here",
    "Content-Type": "application/json"
  },
  "closeHeader": {
    "Authorization": "Bearer your-token-here",
    "Content-Type": "application/json"
  },
  "autoLock": true,
  "autoLockDelay": 60
}
```

## Troubleshooting Guide

### Common Issues & Solutions

**Device shows "No Response" in HomeKit**
- Verify device URL is accessible from Homebridge server
- Check network connectivity and firewall configuration
- Increase timeout value for slower responding devices

**HTTP Authentication Failures (401/403)**
- Confirm username/password credentials are correct
- Verify API key or token requirements in headers
- Ensure device supports HTTP Basic Authentication

**Lock state not updating properly**
- Review Homebridge logs for detailed error messages
- Confirm URL endpoints return HTTP success codes (200-299)
- Test URLs manually using curl or web browser

**Auto-lock feature not functioning**
- Verify `closeURL` is configured when using `autoLock`
- Check `autoLockDelay` timing configuration
- Monitor logs for auto-lock execution messages

### Debug Configuration

Enable detailed logging in Homebridge:

```json
{
  "platforms": [],
  "accessories": [...],
  "log": {
    "method": "systemd",
    "level": "debug"
  }
}
```

### Manual Testing

Test device endpoints manually:

```bash
# Simple GET request
curl -v "http://your-device/unlock"

# POST request with authentication
curl -v -X POST \
  -H "Content-Type: application/json" \
  -u "username:password" \
  -d '{"action":"unlock"}' \
  "https://your-device/api/control"
```

## Migration from Previous Versions

1. **Update Dependencies**: Remove old plugin versions and install v2.0+
2. **Node.js Upgrade**: Update to Node.js 18+ if running older versions
3. **Configuration Compatibility**: All existing configurations remain compatible
4. **Homebridge Version**: Update to 1.6.0+ for optimal compatibility

## Contributing to Development

1. Fork the project repository
2. Create a feature development branch
3. Implement your changes with proper testing
4. Add documentation for new features
5. Submit a pull request for review

## Legal Information

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for complete details.

## Support Resources

- **Issue Reporting**: [GitHub Issues](https://github.com/350d/homebridge-http-lock/issues)
- **Community Support**: [Homebridge Discord](https://discord.gg/homebridge)
- **Discussion Forum**: [r/homebridge](https://reddit.com/r/homebridge)

## Version History

### v2.0.0
- **Breaking Change**: Requires Node.js 18+
- **Breaking Change**: Requires Homebridge 1.6.0+
- Full Homebridge 2.0 compatibility implementation
- Migrated from deprecated `request` library to `axios`
- Enhanced error handling and detailed logging system
- Improved security and performance optimizations
- Advanced debug logging capabilities
- Comprehensive configuration validation

### v1.0.0
- Initial plugin release
- Core HTTP lock functionality
- Basic auto-lock and state reset features
