'use strict';
const { send } = require('../../lib/http');
const { isAdmin } = require('../../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' }, { Allow: 'GET' });
  return (await isAdmin(req)) ? send(res, 200, { ok: true }) : send(res, 401, { ok: false });
};
