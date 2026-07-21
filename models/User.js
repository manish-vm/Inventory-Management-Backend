const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, unique: true, sparse: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String },
  address: { type: String },
  role: { 
    type: String, 
    enum: ['superadmin', 'admin', 'employee', 'inspector'], 
    default: 'employee' 
  },
  dealerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Dealer' 
  },
  manufacturingLevel: { 
    type: Number, 
    default: 1,
    min: 1,
    max: 10 // Assuming levels 1-10
  },
  assignedStages: [{
    stageNumber: Number,
    stageName: String
  }],
  assignedRole: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    default: null
  },
  assignedFinalStageRole: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    default: null
  },
  assignedFinalStages: [{
    stageNumber: Number,
    stageName: String
  }],
  shift: {
    type: String,
    enum: ['day', 'evening', 'night'],
    default: 'day'
  },
  isActive: { type: Boolean, default: true },
  monthlySalesTarget: { type: Number, default: 0 },
  salesCount: { type: Number, default: 0 }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
