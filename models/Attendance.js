const mongoose = require('mongoose');

const attendanceSessionSchema = new mongoose.Schema(
  {
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, default: null },
    durationMinutes: { type: Number, default: 0, min: 0 }
  },
  { _id: true }
);

const attendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    dealerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dealer',
      default: null,
      index: true
    },
    attendanceDate: {
      type: String,
      required: true,
      index: true
    },
    shift: {
      type: String,
      enum: ['day', 'evening', 'night'],
      required: true
    },
    sessions: {
      type: [attendanceSessionSchema],
      default: []
    },
    totalMinutes: {
      type: Number,
      default: 0,
      min: 0
    },
    firstCheckIn: {
      type: Date,
      default: null
    },
    lastCheckOut: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

attendanceSchema.index({ userId: 1, attendanceDate: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
