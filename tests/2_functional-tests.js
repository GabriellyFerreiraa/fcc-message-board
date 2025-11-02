const chai = require('chai');
const chaiHttp = require('chai-http');
const assert = chai.assert;
const server = require('../server');

chai.use(chaiHttp);

suite('Functional Tests', function () {
  const board = 'general';
  let threadId;
  let replyId;

  test('Create thread: POST /api/threads/{board}', function (done) {
    chai.request(server)
      .post('/api/threads/' + board)
      .send({ text: 'Hello FCC', delete_password: 'pass123' })
      .end((err, res) => {
        assert.equal(res.status, 200);
        assert.property(res.body, '_id');
        assert.property(res.body, 'text');
        assert.property(res.body, 'created_on');
        assert.property(res.body, 'bumped_on');
        threadId = res.body._id;
        done();
      });
  });

  test('Get threads: GET /api/threads/{board}', function (done) {
    chai.request(server)
      .get('/api/threads/' + board)
      .end((err, res) => {
        assert.equal(res.status, 200);
        assert.isArray(res.body);
        assert.isAtMost(res.body.length, 10);
        assert.notProperty(res.body[0], 'reported');
        assert.notProperty(res.body[0], 'delete_password');
        done();
      });
  });

  test('Report thread: PUT /api/threads/{board}', function (done) {
    chai.request(server)
      .put('/api/threads/' + board)
      .send({ thread_id: threadId })
      .end((err, res) => {
        assert.equal(res.status, 200);
        assert.equal(res.text, 'reported');
        done();
      });
  });

  test('Create reply: POST /api/replies/{board}', function (done) {
    chai.request(server)
      .post('/api/replies/' + board)
      .send({ thread_id: threadId, text: 'A reply', delete_password: 'passr' })
      .end((err, res) => {
        assert.equal(res.status, 200);
        assert.property(res.body, 'replies');
        replyId = res.body.replies[res.body.replies.length - 1]._id;
        done();
      });
  });

  test('Get thread with all replies: GET /api/replies/{board}', function (done) {
    chai.request(server)
      .get('/api/replies/' + board)
      .query({ thread_id: threadId })
      .end((err, res) => {
        assert.equal(res.status, 200);
        assert.property(res.body, 'replies');
        assert.isArray(res.body.replies);
        done();
      });
  });

  test('Report reply: PUT /api/replies/{board}', function (done) {
    chai.request(server)
      .put('/api/replies/' + board)
      .send({ thread_id: threadId, reply_id: replyId })
      .end((err, res) => {
        assert.equal(res.status, 200);
        assert.equal(res.text, 'reported');
        done();
      });
  });

  test('Delete reply (wrong password): DELETE /api/replies/{board}', function (done) {
    chai.request(server)
      .delete('/api/replies/' + board)
      .send({ thread_id: threadId, reply_id: replyId, delete_password: 'wrong' })
      .end((err, res) => {
        assert.equal(res.status, 200);
        assert.equal(res.text, 'incorrect password');
        done();
      });
  });

  test('Delete reply (correct password): DELETE /api/replies/{board}', function (done) {
    chai.request(server)
      .delete('/api/replies/' + board)
      .send({ thread_id: threadId, reply_id: replyId, delete_password: 'passr' })
      .end((err, res) => {
        assert.equal(res.status, 200);
        assert.equal(res.text, 'success');
        done();
      });
  });

  test('Delete thread (wrong password): DELETE /api/threads/{board}', function (done) {
    chai.request(server)
      .delete('/api/threads/' + board)
      .send({ thread_id: threadId, delete_password: 'nope' })
      .end((err, res) => {
        assert.equal(res.status, 200);
        assert.equal(res.text, 'incorrect password');
        done();
      });
  });

  test('Delete thread (correct password): DELETE /api/threads/{board}', function (done) {
    chai.request(server)
      .delete('/api/threads/' + board)
      .send({ thread_id: threadId, delete_password: 'pass123' })
      .end((err, res) => {
        assert.equal(res.status, 200);
        assert.equal(res.text, 'success');
        done();
      });
  });
});
