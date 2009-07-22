/**
 * Print some debug message to the console. All arguments will be printed,
 * separated by spaces.
 *
 * @param [arg0, arg1, arg2, ...]
 *        Any number of arguments to print out
 * @usage _("Hello World") -> prints "Hello World"
 * @usage _(1, 2, 3) -> prints "1 2 3"
 */
let _ = function(some, debug, text, to) print(Array.slice(arguments).join(" "));

_("Make sure Collection can correctly incrementally parse GET requests");
Cu.import("resource://weave/base_records/collection.js");
Cu.import("resource://weave/base_records/wbo.js");

function run_test() {
  let coll = new Collection("", WBORecord);
  let stream = { _data: "" };
  let called, recCount, sum;

  _("Parse empty string payload as deleted");
  called = false;
  stream._data = '[{"payload":""}]';
  coll.recordHandler = function(rec) {
    called = true;
    _("Got record:", JSON.stringify(rec));
    do_check_true(rec.deleted);
  };
  coll._onProgress.call(stream);
  do_check_eq(stream._data, '');
  do_check_true(called);
  _("\n");


  _("Parse record with payload");
  called = false;
  stream._data = '[{"payload":"{\\"value\\":123}"}]';
  coll.recordHandler = function(rec) {
    called = true;
    _("Got record:", JSON.stringify(rec));
    do_check_eq(rec.payload.value, 123);
  };
  coll._onProgress.call(stream);
  do_check_eq(stream._data, '');
  do_check_true(called);
  _("\n");


  _("Parse multiple records in one go");
  called = false;
  recCount = 0;
  sum = 0;
  stream._data = '[{"payload":"{\\"value\\":100}"},{"payload":"{\\"value\\":10}"},{"payload":"{\\"value\\":1}"}]';
  coll.recordHandler = function(rec) {
    called = true;
    _("Got record:", JSON.stringify(rec));
    recCount++;
    sum += rec.payload.value;
    _("Incremental status: count", recCount, "sum", sum);
    switch (recCount) {
      case 1:
        do_check_eq(rec.payload.value, 100);
        do_check_eq(sum, 100);
        break;
      case 2:
        do_check_eq(rec.payload.value, 10);
        do_check_eq(sum, 110);
        break;
      case 3:
        do_check_eq(rec.payload.value, 1);
        do_check_eq(sum, 111);
        break;
      default:
        do_throw("unexpected number of record counts", recCount);
        break;
    }
  };
  coll._onProgress.call(stream);
  do_check_eq(recCount, 3);
  do_check_eq(sum, 111);
  do_check_eq(stream._data, '');
  do_check_true(called);
  _("\n");


  _("Handle incremental data incoming");
  called = false;
  recCount = 0;
  sum = 0;
  stream._data = '[{"payl';
  coll.recordHandler = function(rec) {
    called = true;
    do_throw("shouldn't have gotten a record..");
  };
  coll._onProgress.call(stream);
  _("shouldn't have gotten anything yet");
  do_check_eq(recCount, 0);
  do_check_eq(sum, 0);
  _("leading array bracket should have been trimmed");
  do_check_eq(stream._data, '{"payl');
  do_check_false(called);
  _();

  _("adding more data enough for one record..");
  called = false;
  stream._data += 'oad":"{\\"value\\":100}"},';
  coll.recordHandler = function(rec) {
    called = true;
    _("Got record:", JSON.stringify(rec));
    recCount++;
    sum += rec.payload.value;
  };
  coll._onProgress.call(stream);
  _("should have 1 record with sum 100");
  do_check_eq(recCount, 1);
  do_check_eq(sum, 100);
  _("all data should have been consumed including trailing comma");
  do_check_eq(stream._data, '');
  do_check_true(called);
  _();

  _("adding more data..");
  called = false;
  stream._data += '{"payload":"{\\"value\\":10}"';
  coll.recordHandler = function(rec) {
    called = true;
    do_throw("shouldn't have gotten a record..");
  };
  coll._onProgress.call(stream);
  _("should still have 1 record with sum 100");
  do_check_eq(recCount, 1);
  do_check_eq(sum, 100);
  _("should almost have a record");
  do_check_eq(stream._data, '{"payload":"{\\"value\\":10}"');
  do_check_false(called);
  _();

  _("add data for two records..");
  called = false;
  stream._data += '},{"payload":"{\\"value\\":1}"}';
  coll.recordHandler = function(rec) {
    called = true;
    _("Got record:", JSON.stringify(rec));
    recCount++;
    sum += rec.payload.value;
    switch (recCount) {
      case 2:
        do_check_eq(rec.payload.value, 10);
        do_check_eq(sum, 110);
        break;
      case 3:
        do_check_eq(rec.payload.value, 1);
        do_check_eq(sum, 111);
        break;
      default:
        do_throw("unexpected number of record counts", recCount);
        break;
    }
  };
  coll._onProgress.call(stream);
  _("should have gotten all 3 records with sum 111");
  do_check_eq(recCount, 3);
  do_check_eq(sum, 111);
  _("should have consumed all data");
  do_check_eq(stream._data, '');
  do_check_true(called);
  _();

  _("add ending array bracket");
  called = false;
  stream._data += ']';
  coll.recordHandler = function(rec) {
    called = true;
    do_throw("shouldn't have gotten a record..");
  };
  coll._onProgress.call(stream);
  _("should still have 3 records with sum 111");
  do_check_eq(recCount, 3);
  do_check_eq(sum, 111);
  _("should have consumed the last array bracket");
  do_check_eq(stream._data, "");
  do_check_false(called);
  _("\n");
}
