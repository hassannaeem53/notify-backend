// eslint-disable-next-line import/no-extraneous-dependencies
const httpStatus = require('http-status-codes');
const { Application } = require('../../models/application');
const { Event } = require('../../models/event');

async function listAllEvents(req, res) {
  const { filter } = req; // Default to empty filter if not specified
  const { sort, sortby } = req.query;

  if (filter.name) {
    filter.name = filter.name.trim();
    filter.name = { $regex: filter.name, $options: 'i' };
  }

  const application = await Application.findById(req.query.applicationId);

  if (!application) {
    return res.status(httpStatus.StatusCodes.NOT_FOUND).json({
      error: httpStatus.getReasonPhrase(httpStatus.StatusCodes.NOT_FOUND),
      message: 'No applications found.',
    });
  }
  const page = parseInt(req.query.page, 10) || 1; // Default to page 1 if not specified
  const limit = parseInt(req.query.limit, 10) || 4; // Default limit to 3 if not specified

  const startIndex = (page - 1) * limit;

  const query = Event.find(filter).skip(startIndex).limit(limit);

  // Apply sorting based on sort and sortby query parameters
  if (
    sortby === 'name' ||
    sortby === 'is_active' ||
    sortby === 'created_at' ||
    sortby === 'updated_at'
  ) {
    const sortOrder = sort === 'desc' ? -1 : 1;
    query.sort({ [sortby]: sortOrder });
  }

  const totalDocuments = await Event.countDocuments(filter);
  const totalPages = Math.ceil(totalDocuments / limit);

  const events = await query;

  const paginationInfo = {
    currentPage: page,
    totalPages,
    pageSize: limit,
    totalCount: totalDocuments,
  };

  return res
    .status(httpStatus.StatusCodes.OK)
    .json({ events, pagination: paginationInfo });
}

// POST api/events?applicationId=xxx
async function createEvent(req, res) {
  const applicationId = await Application.findById(req.body.applicationId);
  if (!applicationId)
    return res.status(httpStatus.StatusCodes.NOT_FOUND).json({
      error: httpStatus.getReasonPhrase(httpStatus.StatusCodes.NOT_FOUND),
      message: 'Invalid application or Application Id not given',
    });

  // check if the event with the same name already exists in the application
  req.body.name = req.body.name.trim();
  const existingEvent = await Event.findOne({
    name: { $regex: new RegExp(req.body.name, 'i') },
    applicationId: req.body.applicationId,
    is_deleted: false,
  });

  if (existingEvent) {
    return res.status(httpStatus.StatusCodes.CONFLICT).json({
      error: httpStatus.getReasonPhrase(httpStatus.StatusCodes.CONFLICT),
      message: 'Event with the name already exists.',
    });
  }

  let event = new Event({
    name: req.body.name,
    description: req.body.description,
    is_deleted: false,
    is_active: true,
    applicationId: req.body.applicationId,
  });
  event = await event.save();

  return res.status(httpStatus.StatusCodes.CREATED).send(event);
}

// PATCH api/events/:id
async function updateEvent(req, res) {
  const rest = req.body;

  let event = await Event.findById(req.params.id);
  if (!event)
    return res.status(httpStatus.StatusCodes.NOT_FOUND).json({
      error: httpStatus.getReasonPhrase(httpStatus.StatusCodes.NOT_FOUND),
      message: 'Invalid Event or Event Id not given',
    });

  // check if the event with the same name already exists in the application
  if (req.body.name) {
    req.body.name = req.body.name.trim();
    const existingEvent = await Event.findOne({
      name: { $regex: new RegExp(req.body.name, 'i') },
      applicationId: event.applicationId,
      is_deleted: false,
      _id: { $ne: req.params.id },
    });
    if (existingEvent) {
      return res.status(httpStatus.StatusCodes.CONFLICT).json({
        error: httpStatus.getReasonPhrase(httpStatus.StatusCodes.CONFLICT),
        message: 'Event with the name already exists.',
      });
    }
  }
  // const currentDate = new Date(); // Get the current date and time
  // const year = currentDate.getFullYear(); // Get the current year
  // const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Get the current month (January is 0, so add 1)
  // const day = String(currentDate.getDate()).padStart(2, '0'); // Get the current day
  // const hours = String(currentDate.getHours()).padStart(2, '0'); // Get the current hour
  // const minutes = String(currentDate.getMinutes()).padStart(2, '0'); // Get the current minute
  // const seconds = String(currentDate.getSeconds()).padStart(2, '0'); // Get the current second
  // const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  // const formattedDate = `${year}-${month}-${day}`;
  rest.updated_at = Date.now();
  event = await Event.findByIdAndUpdate(req.params.id, rest, {
    new: true,
  });

  return res.status(httpStatus.StatusCodes.OK).json({ event });
}

exports.listAllEvents = listAllEvents;
exports.createEvent = createEvent;
exports.updateEvent = updateEvent;
