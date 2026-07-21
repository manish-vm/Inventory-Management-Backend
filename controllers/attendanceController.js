const Attendance = require('../models/Attendance');
const User = require('../models/User');

const ATTENDANCE_TIMEZONE = 'Asia/Kolkata';

const formatAttendanceDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ATTENDANCE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
    .formatToParts(date)
    .reduce((acc, part) => {
      if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
};

const minutesBetween = (start, end) => {
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  return diffMs > 0 ? Math.floor(diffMs / 60000) : 0;
};

const formatMinutes = (minutes = 0) => {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}h ${mins}m`;
};

const buildAttendanceResponse = (attendance) => {
  const openSession = attendance.sessions.find((session) => !session.checkOut) || null;

  return {
    id: attendance._id,
    attendanceDate: attendance.attendanceDate,
    shift: attendance.shift,
    firstCheckIn: attendance.firstCheckIn,
    lastCheckOut: attendance.lastCheckOut,
    totalMinutes: attendance.totalMinutes,
    totalHoursFormatted: formatMinutes(attendance.totalMinutes),
    isCheckedIn: Boolean(openSession),
    openSession,
    sessions: attendance.sessions.map((session) => ({
      id: session._id,
      checkIn: session.checkIn,
      checkOut: session.checkOut,
      durationMinutes: session.durationMinutes,
      durationFormatted: formatMinutes(session.durationMinutes)
    }))
  };
};

const ensureAttendanceEligible = (user) => {
  if (!user) {
    return 'User not found';
  }

  if (user.role === 'superadmin') {
    return 'Superadmin is excluded from attendance check-in and check-out';
  }

  return null;
};

exports.checkIn = async (req, res) => {
  try {
    const eligibilityError = ensureAttendanceEligible(req.user);
    if (eligibilityError) {
      return res.status(403).json({ message: eligibilityError });
    }

    const now = new Date();
    const attendanceDate = formatAttendanceDate(now);
    let attendance = await Attendance.findOne({
      userId: req.user._id,
      attendanceDate
    });

    if (!attendance) {
      attendance = new Attendance({
        userId: req.user._id,
        dealerId: req.user.dealerId || null,
        attendanceDate,
        shift: 'day',
        sessions: [],
        totalMinutes: 0,
        firstCheckIn: now
      });
    }

    const openSession = attendance.sessions.find((session) => !session.checkOut);
    if (openSession) {
      return res.status(400).json({ message: 'You are already checked in. Please check out first.' });
    }

    attendance.shift = attendance.shift || 'day';
    attendance.firstCheckIn = attendance.firstCheckIn || now;
    attendance.sessions.push({
      checkIn: now,
      checkOut: null,
      durationMinutes: 0
    });

    await attendance.save();

    res.status(201).json({
      message: 'Checked in successfully',
      attendance: buildAttendanceResponse(attendance)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.checkOut = async (req, res) => {
  try {
    const eligibilityError = ensureAttendanceEligible(req.user);
    if (eligibilityError) {
      return res.status(403).json({ message: eligibilityError });
    }

    const now = new Date();
    const attendanceDate = formatAttendanceDate(now);
    const attendance = await Attendance.findOne({
      userId: req.user._id,
      attendanceDate
    });

    if (!attendance) {
      return res.status(400).json({ message: 'No check-in found for today.' });
    }

    const openSession = attendance.sessions.find((session) => !session.checkOut);
    if (!openSession) {
      return res.status(400).json({ message: 'No active check-in found. Please check in first.' });
    }

    openSession.checkOut = now;
    openSession.durationMinutes = minutesBetween(openSession.checkIn, now);
    attendance.totalMinutes = attendance.sessions.reduce(
      (sum, session) => sum + (session.durationMinutes || 0),
      0
    );
    attendance.lastCheckOut = now;

    await attendance.save();

    res.json({
      message: 'Checked out successfully',
      attendance: buildAttendanceResponse(attendance)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMyAttendance = async (req, res) => {
  try {
    const eligibilityError = ensureAttendanceEligible(req.user);
    if (eligibilityError) {
      return res.status(403).json({ message: eligibilityError });
    }

    const requestedDate = req.query.date || formatAttendanceDate(new Date());
    const attendance = await Attendance.findOne({
      userId: req.user._id,
      attendanceDate: requestedDate
    });

    res.json({
      attendanceDate: requestedDate,
      attendance: attendance ? buildAttendanceResponse(attendance) : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAdminOverview = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const attendanceDate = req.query.date || formatAttendanceDate(new Date());
    const search = req.query.search?.trim();
    const status = req.query.status?.trim();

    const userQuery = {
      dealerId: req.user.dealerId || null,
      role: { $in: ['employee', 'inspector', 'admin'] },
      isActive: true
    };

    if (search) {
      userQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(userQuery)
      .select('name email phone role isActive')
      .sort({ name: 1 })
      .lean();

    const attendanceRows = await Attendance.find({
      userId: { $in: users.map((user) => user._id) },
      attendanceDate
    }).lean();

    const attendanceByUser = new Map(
      attendanceRows.map((attendance) => [String(attendance.userId), attendance])
    );

    const rows = users.map((user) => {
      const attendance = attendanceByUser.get(String(user._id));
      const openSession = attendance?.sessions?.find((session) => !session.checkOut);
      const totalMinutes = attendance?.totalMinutes || 0;

      return {
        userId: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        attendanceDate,
        status: openSession ? 'checked-in' : attendance ? 'checked-out' : 'absent',
        firstCheckIn: attendance?.firstCheckIn || null,
        lastCheckOut: attendance?.lastCheckOut || null,
        totalMinutes,
        totalHoursFormatted: formatMinutes(totalMinutes),
        sessionsCount: attendance?.sessions?.length || 0
      };
    }).filter((row) => (status ? row.status === status : true));

    const summary = rows.reduce(
      (acc, row) => {
        acc.totalUsers += 1;
        acc.totalMinutes += row.totalMinutes;
        if (row.status === 'checked-in') acc.checkedInCount += 1;
        if (row.status === 'checked-out') acc.checkedOutCount += 1;
        if (row.status === 'absent') acc.absentCount += 1;
        return acc;
      },
      {
        date: attendanceDate,
        totalUsers: 0,
        checkedInCount: 0,
        checkedOutCount: 0,
        absentCount: 0,
        totalMinutes: 0
      }
    );

    res.json({
      summary: {
        ...summary,
        totalHoursFormatted: formatMinutes(summary.totalMinutes)
      },
      rows
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
