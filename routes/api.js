'use strict';
const mongoose = require('mongoose');

const useMongo = !!mongoose.connection.readyState || !!process.env.MONGO_URI;

/* ======================= Esquemas ======================= */
let Thread, Reply;

if (useMongo) {
  const replySchema = new mongoose.Schema({
    text: String,
    created_on: { type: Date, default: Date.now },
    reported: { type: Boolean, default: false },
    delete_password: String
  });

  const threadSchema = new mongoose.Schema({
    board: String,
    text: String,
    created_on: { type: Date, default: Date.now },
    bumped_on: { type: Date, default: Date.now },
    reported: { type: Boolean, default: false },
    delete_password: String,
    replies: [replySchema]
  });

  Thread = mongoose.models.Thread || mongoose.model('Thread', threadSchema);
} else {
  // Memoria: Map<board, Array<thread>>
  const mem = new Map();
  Thread = {
    async create(doc) {
      const id = new mongoose.Types.ObjectId();
      const t = { _id: id, replies: [], reported: false, ...doc };
      const arr = mem.get(doc.board) || [];
      arr.push(t);
      mem.set(doc.board, arr);
      return t;
    },
    async find(board) {
      return (mem.get(board) || []).slice();
    },
    async findById(id) {
      for (const arr of mem.values()) {
        const f = arr.find(t => String(t._id) === String(id));
        if (f) return f;
      }
      return null;
    },
    async deleteOne(board, id) {
      const arr = mem.get(board) || [];
      const idx = arr.findIndex(t => String(t._id) === String(id));
      if (idx >= 0) { arr.splice(idx, 1); mem.set(board, arr); return { deletedCount: 1 }; }
      return { deletedCount: 0 };
    },
    mem
  };
}

/* Ocultar campos sensibles */
function sanitizeThread(t, limitReplies = true) {
  const base = {
    _id: t._id,
    text: t.text,
    created_on: t.created_on,
    bumped_on: t.bumped_on,
  };
  const replies = (t.replies || []).map(r => ({
    _id: r._id,
    text: r.text,
    created_on: r.created_on
  }));

  base.replies = limitReplies ? replies.slice(-3).reverse() : replies;
  base.replycount = (t.replies || []).length;
  return base;
}

module.exports = function(app) {

  /* ==================== THREADS ==================== */
  app.route('/threads/:board')
    .post(async (req, res) => {
      const { board } = req.params;
      const { text, delete_password } = req.body;

      if (!text || !delete_password) return res.status(400).json({ error: 'text and delete_password required' });

      if (useMongo) {
        const t = await Thread.create({ board, text, delete_password, created_on: new Date(), bumped_on: new Date() });
        return res.json(sanitizeThread(t, false));
      } else {
        const t = await Thread.create({ board, text, delete_password, created_on: new Date(), bumped_on: new Date() });
        return res.json(sanitizeThread(t, false));
      }
    })
    .get(async (req, res) => {
      const { board } = req.params;

      let threads = [];
      if (useMongo) {
        threads = await Thread.find({ board }).sort({ bumped_on: -1 }).limit(10).lean();
      } else {
        threads = (await Thread.find(board))
          .sort((a, b) => new Date(b.bumped_on) - new Date(a.bumped_on))
          .slice(0, 10);
      }

      return res.json(threads.map(t => sanitizeThread(t, true)));
    })
    .delete(async (req, res) => {
      const { board } = req.params;
      const { thread_id, delete_password } = req.body;

      if (!thread_id || !delete_password) return res.status(400).send('missing fields');

      if (useMongo) {
        const t = await Thread.findById(thread_id);
        if (!t) return res.send('incorrect password');
        if (t.delete_password !== delete_password) return res.send('incorrect password');
        await Thread.deleteOne({ _id: thread_id });
        return res.send('success');
      } else {
        const t = await Thread.findById(thread_id);
        if (!t) return res.send('incorrect password');
        if (t.delete_password !== delete_password) return res.send('incorrect password');
        const del = await Thread.deleteOne(board, thread_id);
        return res.send(del.deletedCount ? 'success' : 'incorrect password');
      }
    })
    .put(async (req, res) => {
      const { thread_id } = req.body;
      if (!thread_id) return res.status(400).send('missing thread_id');

      if (useMongo) {
        const t = await Thread.findById(thread_id);
        if (!t) return res.send('reported');
        t.reported = true;
        await t.save();
      } else {
        const t = await Thread.findById(thread_id);
        if (t) t.reported = true;
      }
      return res.send('reported');
    });

  /* ==================== REPLIES ==================== */
  app.route('/replies/:board')
    .post(async (req, res) => {
      const { thread_id, text, delete_password } = req.body;
      if (!thread_id || !text || !delete_password) return res.status(400).json({ error: 'missing fields' });

      const now = new Date();

      if (useMongo) {
        const t = await Thread.findById(thread_id);
        if (!t) return res.status(404).json({ error: 'thread not found' });

        t.replies.push({
          _id: new mongoose.Types.ObjectId(),
          text,
          delete_password,
          created_on: now,
          reported: false
        });
        t.bumped_on = now;
        await t.save();
        return res.json(sanitizeThread(t, false));
      } else {
        const t = await Thread.findById(thread_id);
        if (!t) return res.status(404).json({ error: 'thread not found' });
        const r = { _id: new mongoose.Types.ObjectId(), text, delete_password, created_on: now, reported: false };
        t.replies.push(r);
        t.bumped_on = now;
        return res.json(sanitizeThread(t, false));
      }
    })
    .get(async (req, res) => {
      const { thread_id } = req.query;
      if (!thread_id) return res.status(400).json({ error: 'thread_id required' });

      if (useMongo) {
        const t = await Thread.findById(thread_id).lean();
        if (!t) return res.status(404).json({ error: 'thread not found' });
        return res.json(sanitizeThread(t, false));
      } else {
        const t = await Thread.findById(thread_id);
        if (!t) return res.status(404).json({ error: 'thread not found' });
        return res.json(sanitizeThread(t, false));
      }
    })
    .delete(async (req, res) => {
      const { thread_id, reply_id, delete_password } = req.body;
      if (!thread_id || !reply_id || !delete_password) return res.status(400).send('missing fields');

      if (useMongo) {
        const t = await Thread.findById(thread_id);
        if (!t) return res.send('incorrect password');
        const r = t.replies.id(reply_id);
        if (!r || r.delete_password !== delete_password) return res.send('incorrect password');
        r.text = '[deleted]';
        await t.save();
        return res.send('success');
      } else {
        const t = await Thread.findById(thread_id);
        if (!t) return res.send('incorrect password');
        const r = (t.replies || []).find(x => String(x._id) === String(reply_id));
        if (!r || r.delete_password !== delete_password) return res.send('incorrect password');
        r.text = '[deleted]';
        return res.send('success');
      }
    })
    .put(async (req, res) => {
      const { thread_id, reply_id } = req.body;
      if (!thread_id || !reply_id) return res.status(400).send('missing fields');

      if (useMongo) {
        const t = await Thread.findById(thread_id);
        if (t) {
          const r = t.replies.id(reply_id);
          if (r) { r.reported = true; await t.save(); }
        }
      } else {
        const t = await Thread.findById(thread_id);
        if (t) {
          const r = (t.replies || []).find(x => String(x._id) === String(reply_id));
          if (r) r.reported = true;
        }
      }
      return res.send('reported');
    });
};
