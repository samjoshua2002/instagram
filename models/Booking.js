const mongoose = require('mongoose');

// Appointment / reservation agreed in a business DM conversation
const BookingSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  senderId: {
    type: String,
    required: true,
  },
  handle: {
    type: String,
    default: '',
  },
  serviceName: {
    type: String,
    default: '',
  },
  bookingTime: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'pending',
  },
}, { timestamps: true });

module.exports = mongoose.model('Booking', BookingSchema);
