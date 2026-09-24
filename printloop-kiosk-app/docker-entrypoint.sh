#!/bin/bash
set -e

# Start D-Bus and Avahi for printer discovery
service dbus start
service avahi-daemon start

# Start cups-browsed for network printer discovery
cups-browsed &

# Start ipp-usb for USB printer support
ipp-usb &

# Start the kiosk app
exec node dist/main/index.js