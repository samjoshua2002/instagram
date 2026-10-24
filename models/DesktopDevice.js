const mongoose = require('mongoose');

// Desktop (Tauri) app install registered for native push notifications
const DesktopDeviceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  platform: {
    type: String,
    enum: ['macos-arm64', 'macos-x64', 'windows-x64', 'windows-x86'],
    required: true,
  },
  deviceName: {
    type: String,
    default: '',
  },
  pushToken: {
    type: String,
    default: '',
  },
  lastActiveAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

module.exports = mongoose.model('DesktopDevice', DesktopDeviceSchema);
