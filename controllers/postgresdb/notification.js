/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
/* eslint-disable camelcase */
// eslint-disable-next-line import/no-extraneous-dependencies
const httpStatus = require('http-status-codes');
const knex = require('../../startup/postgresdb/db');

async function listAllNotifications(req, res) {
  const { eventId: event_id, ...filter } = req.filter; // Default to empty filter if not specified
  const { sort, sortby } = req.query;
  const { page, limit } = req.query; // Destructure page and limit from req.query
  // Convert page and limit to integers with default values
  const currentPage = parseInt(page, 10) || 1;
  const pageSize = parseInt(limit, 10) || 3;

  // Calculate startIndex for pagination
  const startIndex = (currentPage - 1) * pageSize;

  // Fetch the event by ID
  const event = await knex('events').where('id', event_id).first();
  if (!event) {
    return res.status(httpStatus.StatusCodes.NOT_FOUND).json({
      error: httpStatus.getReasonPhrase(httpStatus.StatusCodes.NOT_FOUND),
      message: 'No events found.',
    });
  }

  // Build a query for getting the total count of notifications associated with the event
  const totalDocumentsQuery = knex('notifications')
    .where('event_id', event_id)
    .where(filter)
    .where('is_deleted', false)
    .count('* as totalDocuments')
    .first();

  // Fetch the total count
  const { totalDocuments } = await totalDocumentsQuery;

  const totalPages = Math.ceil(totalDocuments / pageSize);

  // Build the query for fetching notifications associated with the event
  const notificationsQuery = knex('notifications')
    .select('*')
    .where('event_id', event_id)
    .where(filter)
    .where('is_deleted', false)
    .offset(startIndex)
    .limit(pageSize);

  // Apply sorting based on the 'sort' and 'sortby' parameters
  if (sort && sortby) {
    const sortOrder = sort === 'asc' ? 'asc' : 'desc';
    notificationsQuery.orderBy(sortby, sortOrder);
  }

  // Fetch notifications associated with the event
  const notifications = await notificationsQuery;

  const paginationInfo = {
    currentPage,
    totalPages,
    pageSize,
    totalCount: totalDocuments,
  };

  return res
    .status(httpStatus.StatusCodes.OK)
    .json({ notifications, pagination: paginationInfo });
}

function parseTemplate(template_body) {
  // eslint-disable-next-line no-useless-escape
  const regex = /\{\{([^\}]+)\}\}/g;
  const matches = [];
  let match;

  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(template_body))) {
    matches.push({ label: match[1] });
  }

  return matches;
}

async function createNotification(req, res) {
  const { eventId } = req.body;

  // Fetch the event by ID
  const event = await knex('events').where('id', eventId).first();

  if (!event) {
    return res.status(httpStatus.StatusCodes.NOT_FOUND).json({
      error: httpStatus.getReasonPhrase(httpStatus.StatusCodes.NOT_FOUND),
      message: 'Invalid Event',
    });
  }

  const { name, description, templatebody } = req.body;

  // check if notification with given name exist for the event
  const notification = await knex('notifications')
    .where({ name: req.body.name })
    .where({ event_id: eventId })
    .first();
  if (notification) {
    return res.status(httpStatus.StatusCodes.CONFLICT).json({
      error: httpStatus.getReasonPhrase(httpStatus.StatusCodes.CONFLICT),
      message: 'Notification with the name already exists.',
    });
  }

  const parseTags = parseTemplate(templatebody); // Assuming parseTemplate function is defined

  // Insert the new notification record
  const [newNotification] = await knex('notifications')
    .insert({
      name,
      description,
      is_deleted: false,
      event_id: eventId,
      templatebody,
      tags: JSON.stringify(parseTags), // Store tags as a JSON array
      is_active: true,
    })
    .returning('*');

  // Insert new tags if they don't exist
  for (const tag of parseTags) {
    const tagFound = await knex('tags').where('label', tag.label).first();
    if (!tagFound) {
      await knex('tags').insert({ label: tag.label });
    }
  }

  return res.status(httpStatus.StatusCodes.CREATED).send(newNotification);
}

// PATCH /api/notification/:id?eventId=xxx&appId=xxx
async function updateNotification(req, res) {
  const { eventId, ...rest } = req.body;

  // Fetch the event by ID
  // const event = await knex('events').where('id', eventId).first();
  // if (!event) {
  //   return res.status(httpStatus.StatusCodes.NOT_FOUND).json({
  //     error: httpStatus.getReasonPhrase(httpStatus.StatusCodes.NOT_FOUND),
  //     message: 'Invalid Event or Event Id not given',
  //   });
  // }
  const notification = await knex('notifications')
    .where('id', req.params.id)
    .first();
  if (!notification) {
    return res.status(httpStatus.StatusCodes.NOT_FOUND).json({
      error: httpStatus.getReasonPhrase(httpStatus.StatusCodes.NOT_FOUND),
      message: 'Invalid Notification or Notification Id not given',
    });
  }
  if (req.body.name) {
    // check if notification with given name exist for the event
    const notification_exists = await knex('notifications')
      .where({ name: req.body.name })
      .where({ event_id: notification.event_id })
      .first();
    if (notification_exists) {
      return res.status(httpStatus.StatusCodes.CONFLICT).json({
        error: httpStatus.getReasonPhrase(httpStatus.StatusCodes.CONFLICT),
        message: 'Notification with the name already exists.',
      });
    }
  }
  if (req.body.templatebody) {
    const tagsArray = parseTemplate(req.body.templatebody);
    // Convert tags array to JSON string
    rest.tags = JSON.stringify(tagsArray);

    // Insert new tags if they don't exist
    for (const tag of tagsArray) {
      const tagFound = await knex('tags').where('label', tag.label).first();
      if (!tagFound) {
        await knex('tags').insert({ label: tag.label });
      }
    }
  }
  // Update the notification in the database
  const updatedNotification = await knex('notifications')
    .where('id', req.params.id)
    .update(rest, ['*']);
  return res.status(httpStatus.StatusCodes.OK).json(updatedNotification[0]);
}

// POST /api/notification/:id/message
async function previewNotificationMessage(req, res) {
  const rest = req.body;
  const notificationId = req.params.id;

  // Fetch the notification by ID
  const notification = await knex('notifications')
    .where('id', notificationId)
    .first();
  if (!notification) {
    return res.status(httpStatus.StatusCodes.NOT_FOUND).json({
      error: httpStatus.getReasonPhrase(httpStatus.StatusCodes.NOT_FOUND),
      message: 'Invalid Notification or Notification Id not given',
    });
  }

  const { name } = notification;
  const notificationTags = notification.tags.map((tag) => tag.label);
  const { applicationName, eventName, to: recipients } = rest;

  for (const recipient of recipients) {
    const { email, tags: metadata } = recipient;
    const userTags = Object.keys(metadata);
    let { templatebody } = notification;

    for (const tag of userTags) {
      if (notificationTags.includes(tag)) {
        templatebody = templatebody.replace(`{{${tag}}}`, metadata[tag]);
      }
    }

    templatebody = `${applicationName}\n${eventName}\n${name}\n${templatebody}`;

    const message = {
      email,
      body: templatebody,
      notification_id: notificationId,
    };

    // Insert the new message record
    await knex('messages').insert(message);
  }

  return res
    .status(httpStatus.StatusCodes.OK)
    .json({ message: 'Messages Saved in DB' });
}

exports.listAllNotifications = listAllNotifications;
exports.createNotification = createNotification;
exports.updateNotification = updateNotification;
exports.previewNotificationMessage = previewNotificationMessage;
