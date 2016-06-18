const URL = window.URL || window.webkitURL;

if (!URL) {
  throw new Error('This browser does not support Blob URLs');
}

if (!window.Worker) {
  throw new Error('This browser does not support Web Workers');
}


function Multithread(threads) {
  this.threads = Math.max(2, threads | 0);
  this._queue = [];
  this._queueSize = 0;
  this._activeThreads = 0;
  this._debug = {
    start: 0,
    end: 0,
    time: 0
  };
}

Multithread.prototype._worker = {

  JSON() {
    const name = func;

    self.addEventListener('message', (e) => {
      const data = e.data;
      const view = new DataView(data);
      const len = data.byteLength;
      const str = Array(len);

      for (let i = 0; i < len; i++) {
        str[i] = String.fromCharCode(view.getUint8(i));
      }

      const args = JSON.parse(str.join(''));
      const value = (name).apply(name, args);

      try {
        data = JSON.stringify(value);
      } catch (error) {
        throw new Error('Parallel function must return JSON serializable response');
      }

      const len = typeof data === 'undefined' ? 0 : data.length;
      const buffer = new ArrayBuffer(len);
      const view = new DataView(buffer);

      for (let i = 0; i < len; i++) {
        view.setUint8(i, data.charCodeAt(i) & 255);
      }

      self.postMessage(buffer, [buffer]);
      self.close();
    });
  },

  Int32() {
    const name = (func);

    self.addEventListener('message', (e) => {
      const { data } = e;
      const view = new DataView(data);
      const len = data.byteLength / 4;
      const arr = Array(len);

      for (let i = 0; i < len; i++) {
        arr[i] = view.getInt32(i * 4);
      }

      const value = (name).apply(name, arr);
      if (!(value instanceof Array)) { value = [value]; }
      const len = value.length;
      const buffer = new ArrayBuffer(len * 4);
      view = new DataView(buffer);

      for (let i = 0; i < len; i++) {
        view.setInt32(i * 4, value[i]);
      }

      self.postMessage(buffer, [buffer]);
      self.close();
    });
  },

  Float64() {
    const name = (func);

    self.addEventListener('message', (e) => {
      const data = e.data;
      const view = new DataView(data);
      const len = data.byteLength / 8;
      const arr = Array(len);
      for (let i = 0; i < len; i++) {
        arr[i] = view.getFloat64(i * 8);
      }
      const value = (name).apply(name, arr);
      if (!value instanceof Array) value = [value]
      const len = value.length;
      const buffer = new ArrayBuffer(len * 8);
      view = new DataView(buffer);
      for (i=0;i<len;i++) {
        view.setFloat64(i * 8, value[i]);
      }
      self.postMessage(buffer, [buffer]);
      self.close();
    })
  }
};

Multithread.prototype._encode = {

  JSON(args) {
    try {
      const data = JSON.stringify(args);
    } catch (e) {
      throw new Error('Arguments provided to parallel function must be JSON serializable');
    }

    const len = data.length;
    const buffer = new ArrayBuffer(len);
    const view = new DataView(buffer);

    for (let i = 0; i < len; i++) {
      view.setUint8(i, data.charCodeAt(i) & 255);
    }

    return buffer;
  },

  Int32(args) {
    const len = args.length;
    const buffer = new ArrayBuffer(len * 4);
    const view = new DataView(buffer);

    for (let i = 0; i < len; i++) {
      view.setInt32(i * 4, args[i]);
    }

    return buffer;
  },

  Float64(args) {
    const len = args.length;
    const buffer = new ArrayBuffer(len * 8);
    const view = new DataView(buffer);

    for (let i = 0; i < len; i++) {
      view.setFloat64(i * 8, args[i]);
    }

    return buffer;
  }
};

Multithread.prototype._decode = {

  JSON(data) {
    const view = new DataView(data);
    const len = data.byteLength;
    const str = Array(len);
    for (let i = 0; i < len; i++) {
      str[i] = String.fromCharCode(view.getUint8(i));
    }
    if (!str.length) {
      return;
    } else {
      return JSON.parse(str.join(''));
    }
  },

  Int32(data) {
    const view = new DataView(data);
    const len = data.byteLength / 4;
    const arr = Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = view.getInt32(i * 4);
    }
    return arr;
  },

  Float64(data) {
    const view = new DataView(data);
    const len = data.byteLength / 8;
    const arr = Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = view.getFloat64(i * 8);
    }

    return arr;
  }
};

Multithread.prototype._execute = function (resource, args, type) {
  if (!this._activeThreads) {
    this._debug.start = (new Date).valueOf();
  }

  if (this._activeThreads < this.threads) {
    this._activeThreads++;
    const worker = new Worker(resource);
    const buffer = this._encode[type](args);

    worker.postMessage(buffer, [buffer]);
  } else {
    this._queueSize++;
  }
};

Multithread.prototype.ready = function () {
  this._activeThreads--;

  if (this._queueSize) {
    this._execute.apply(this, this._queue.shift());
    this._queueSize--;
  } else if (!this._activeThreads) {
    this._debug.end = (new Date).valueOf();
    this._debug.time = this._debug.end - this._debug.start;
  }
};

Multithread.prototype._prepare = function (fn, type) {
  const name = fn.name;
  const fnStr = fn.toString();

  if (!name) {
    name = '$' + ((Math.random() * 10) | 0);

    while (fnStr.indexOf(name) !== -1) {
      name += ((Math.random() * 10) | 0);
    }
  }

  const script = this._worker[type]
    .toString()
    .replace(/^.*?[\n\r]+/gi, '')
    .replace(/\}[\s]*$/, '')
    .replace(/\/\*\*\/name\/\*\*\//gi, name)
    .replace(/\/\*\*\/func\/\*\*\//gi, fnStr);

  const resource = URL.createObjectURL(new Blob([script], {type: 'text/javascript'}));

  return resource;
};

Multithread.prototype.process = function (fn) {
  const resource = this._prepare(fn, 'JSON');

  return () => {
    this._execute(resource, [].slice.call(arguments), 'JSON')
  };
};

Multithread.prototype.processInt32 = function (fn) {
  const resource = this._prepare(fn, 'Int32');

  return () => {
    this._execute(resource, [].slice.call(arguments), 'Int32')
  };
};

Multithread.prototype.processFloat64 = function (fn) {
  const resource = this._prepare(fn, 'Float64');

  return () => {
    this._execute(resource, [].slice.call(arguments), 'Float64');
  };
};

export default Multithread;
