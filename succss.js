/**
 * 
 * Succss module.
 *
 * The MIT License (MIT)
 * Copyright (c) 2015 ifzenelse.net
 *
 * @Author B2F
 *
 * @see succss.ifzenelse.net
 *
 */

exports.Succss = Succss;

SuccssCount = {
  planned:0,
  remaining:0,
  failures:0,
  startTime:0,
  startDate:null,
};

function Succss() {

  /*
   * Try catching the initialisation phase, while parsing the javascript configuration data via self.
   * @see succss-bridge.js
   */
  try {

    var self = this;

    if (!self.casper) {
      throw "[SucCSS] Succss.casper instance missing.";
    }

    var casperInstance = self.casper;

    var fs = self.fs;
    var options = self.allOptions;
    var utils = self.utils;
    var mouse = self.mouse;
    var colorizer = self.colorizer;

    self.echo('|-> ' + options.action + ' from file: ' + options.dataFile, 'INFO_BAR');

    if ((typeof self.getAllOptions == 'function')) {
      var logMsg = '[SucCSS] Options: ' + self.getAllOptions();
      self.casper.log(logMsg, 'info');
    }

    if (!self.pages) {
      throw "[SucCSS] Succss.pages instance missing. See succss.ifzenelse.net";
    }
    var data = self.pages;

    // After capture callback.
    var after = self.callback;

    var injectedJSFiles = [];

    var pages = Object.keys(data);

    var capturesFound = false;
    var captureFilters = false;

    var viewportsData = self.viewports || { 
      'default': {
        'width':1366,
        'height':768
      }
    };
    var viewports = Object.keys(viewportsData);

    /**
     * Creates the capture state object used for taking screenshots, naming screenshots (Succss.setFileName),
     * hooking after capture (Succss.callback), then while diffing (Succss.diff | Succss.imagediff | Succss.resemble).
     *
     * @param {String} pageName
     * @param {Number} captureIndex
     * @param {String} viewportName
     * @returns {Object} capture state
     */
    var createCaptureState = function(pageName, captureIndex, viewportName) {
      if (typeof data[pageName] !== 'object') self.catchErrors('Page ' + pageName + ' is missing from your configuration file. You can\'t compareToPage without it. Available pages: ' + Object.keys(data).join(', '));
      if (typeof viewportsData[viewportName] !== 'object') self.catchErrors('Viewport ' + viewportName + ' is missing from your configuration file. You can\'t compareToViewport without it. Available viewports: ' + Object.keys(viewportsData).join(', '));
      if (typeof data[pageName].captures[captureIndex] != 'object') throw('Capture "' + captureIndex + '" is missing from your configuration page named "' + pageName +'"/ Your captures must be present on both sides when compareToPage is used.');
      // Available in setFileName:
      var captureState = data[pageName].captures[captureIndex];
      captureState.page = {};
      for (var prop in data[pageName]) {
        if (prop != 'captures') {
          captureState.page[prop] = data[pageName][prop];
        }
      }
      captureState.viewport = viewportsData[viewportName];
      captureState.options = options;
      captureState.count = SuccssCount;
      // Available in the after capture callback:
      captureState.file = self.setFileName(captureState);
      captureState.filePath = captureState.page.directory.replace(/\/$/, '') + '/' + captureState.file;
      captureState.action = captureState.options.action;
      return captureState;
    }

    // Default filenaming for captured screenshot files:
    if (!self.setFileName) self.setFileName = function(captureState) {
      return captureState.page.name + '--' + captureState.name + '--' + captureState.viewport.width + 'x' + captureState.viewport.height + '.png';
    };

    // Directory path used as reference prefix when checking for differences.
    var checkDir = options.checkDir || '.succss-tmp';
    if (options.checkDir && !fs.isDirectory(checkDir)) {
      throw "[SucCSS] Reference directory not found. Check your --checkDir option.";
    }

    // Processes the --pages option: restricts the pages keys object to it.
    if (options.pages != undefined && options.pages !== true) {
      pages = options.pages.split(',');
      // Support for '=,s...' (Replacement fix for '=s...' with SlimerJs engine):
      while (pages.indexOf('') != -1) {
        pages.splice(pages.indexOf(''), 1);
      }
      self.echo('\n--pages option found, captures will only run for <' + options.pages + '> pages.', 'WARNING');
      for (var p in pages) {
        if(data[pages[p]] == undefined) {
          throw '[SucCSS] The page configuration "' + pages[p] + '" was not found. Available pages: ' + Object.keys(data).join(', ');
        }
      }
    }
    // Processes the --captures option:
    if (options.captures != undefined && options.captures !== true) {
      captureFilters = options.captures.split(',');
      self.echo('\n--captures option found, captures will only run for <' + options.captures + '>', 'WARNING');
    }
    // Processes the --viewports option: restricts the viewports keys object to it.
    if (options.viewports != undefined) {
      viewports = options.viewports.split(',');
      // Support for '=,s...' (Replacement fix for '=s...' with SlimerJs engine):
      while (viewports.indexOf('') != -1) {
        viewports.splice(viewports.indexOf(''), 1);
      }
      self.echo('\n--viewports option found, captures will only run with <' + options.viewports + '> viewport.', 'WARNING');
      for (var v in viewports) {
        if(viewportsData[viewports[v]] == undefined) {
          throw '"[SucCSS] The viewport "' + viewports[v] + '" was not found. Available viewports: ' + Object.keys(viewportsData).join(', ');
        }
      }
    }

    /**
     * Fills the data object with values processed from the javascript configuration file.
     * The data object's has pages and captures properties later used in self.parseData.
     */
    Object.keys(data).forEach(function(page) {

      data[page].name = page;

      if (data[page].source != undefined) {
        var source = data[page].source;
        if (data[source] == undefined) {
          throw '[SucCSS] Source property must have a matching page ("' +  page + '" is missing "' + source + '" source).';
        }
        function extendPage(origin, copy) {
          for (var prop in origin) {
            if (copy[prop] == undefined && typeof origin[prop] != 'object') {
              copy[prop] = origin[prop];
            }
            else if (typeof(origin[prop]) == 'object') {
              copy[prop] = {};
              copy[prop] = extendPage(origin[prop], copy[prop]);
            }
          }
          return copy;
        }
        data[page] = extendPage(data[source], data[page]);
      }

      if (data[page].url == undefined) {
        throw '[SucCSS] Your configuration page "' + page + '" requires an url."';
      }
      if (data[page].url.indexOf('http') != 0) {
        data[page].url = 'http://' + data[page].url;
      }

      if (!data[page].directory) data[page].directory = './screenshots';

      if (options.action == 'add' && options.rmtree == true && fs.isDirectory(data[page].directory)) {
        self.echo('\nWarning! ' + data[page].directory + " directory tree erased.", 'WARNING');
        fs.removeTree(data[page].directory);
      }

      if (data[page].captures == undefined || !Object.keys(data[page].captures).length) {
        data[page].captures = {
          'body':''
        }
      }

      var captures = data[page].captures;
      data[page].captureKeys = Array();

      for (var c in captures) {

        if (captureFilters == false || captureFilters.indexOf(c) != -1) {

          data[page].captureKeys.push(c);
          if (!captureFilters || captureFilters.indexOf(c) != -1) {
            capturesFound = true;
          }
          if (typeof(data[page].captures[c]) == 'object') {
            data[page].captures[c] = captures[c];
            data[page].captures[c].selector = captures[c].selector || c;
            data[page].captures[c].before = captures[c].before || false;
          }
          else {
            data[page].captures[c] = {
              selector:captures[c] || c
            }
          }
          data[page].captures[c].name = c;
          data[page].captures[c].after = after;
        }
      }
    });

    if (!capturesFound) {
      throw "[SucCSS] No captures selector found. Check your Succss.pages configuration and filters.";
    }

    Object.keys(viewportsData).forEach(function(viewportName) {
      viewportsData[viewportName].name = viewportName;
      if (typeof viewportsData[viewportName].height != 'number' ||
          typeof viewportsData[viewportName].width != 'number') {
        throw "[SucCSS] The viewport height and width must be set with numbers.";
      }
    });
    self.echo('Available viewports: ' + Object.keys(viewportsData).join(', '), 'INFO');
  }
  catch (e) {
    self.echo(e + '\n', 'ERROR');
    casperInstance.exit();
  }

  /**
   * Handles "window.callPhantom" messages from casper.evaluate functions.
   */
  casperInstance.on('remote.callback', function(data) {

    // Calls utils.dump when window.callPhantm({dump:object}) is used:
    if (data.dump) {
      utils.dump(data.dump);
    }
    else {
      console.log(data);
    }
  });

  /**
   * Handles completed CasperJs run events, when succss command has finished.
   */
  casperInstance.on('run.complete', function(data) {
    if (SuccssCount.failures) {
      self.echo('Tests failed with ' + SuccssCount.failures + ' errors.', 'ERROR');
    }
    else {
      self.echo('[SUCCSS] All captures (' + SuccssCount.planned + ') tests pass!', 'GREEN_BAR');
    }
  });

  /**
   * Returns a filepath used as image reference.
   *
   * @param {Object} capture state
   * @returns {String} base image filepath
   */
  var getReferenceFilePath = function(capture) {
    // If compareTo{Page|Viewport} option is set, gets the filepath corresponding
    // to the capture index (page, capture, viewport):
    if (options.compareToViewport || options.compareToPage) {
      var pageReference = options.compareToPage || capture.page.name;
      var viewportReference = options.compareToViewport || capture.viewport.name;
      return createCaptureState(pageReference, capture.name, viewportReference).filePath;
    }
    else {
      return capture.filePath;
    }
  }

  /**
   * Prepares a screenshot, then calls the after capture callback if it exists.
   * In case the "checkDir" option is used or during SlimerJs checking phase, screenshots capture will not occur.
   *
   * Note: SlimerJS engine is unable to check updates itself due to canvas writing issues.
   * So succss.py's adds an options.slimerCheck and starts with the 'add' command with PhantomJS taking captures
   * Then updates are checked with the previously made PhantomJS captures instead of live SlimerJs captures,
   * as if Slimer had made them because the default '.succss-tmp' directory is used.
   *
   * @param {Object} capture state
   */
  self.prepareScreenshot = function(capture) {

    // Sets the image reference path for searching image differences when 'succss check' is called:
    capture.basePath = getReferenceFilePath(capture);

    // When 'succss check {config.js}' is called, screenshots images used for computing differences are either
    // written in '.succss-tmp' (the default checkDir value) or found in the path specified by --checkDir.
    // In case of slimerCheck, PhantomJs will capture updates in '.succss-tmp' with the 'add' action.
    if (capture.options.action == 'check'  || options.slimerCheck) {
      capture.filePath = cleanPreprendPath(checkDir, capture.page.directory+'/'+capture.file);
      capture.filePath = capture.filePath.replace(/\.\//, '');
    }

    // @see above SlimerJS engine notes.
    var slimerIsCheckingPhantomCaptures = (capture.options.action == 'check' && options.slimerCheck);

    // Screenshot taking happens with 'add' and normal 'check',
    // it doesn't take place with --checkDir or SlimerJs checks.
    if (!options.checkDir && !slimerIsCheckingPhantomCaptures) {
      self.takeScreenshot(capture);
    }

    casperInstance.then(function() {
      // After capture or on checkDir:
      if (capture.after != undefined) {
        try {
          capture.after.call(self, capture);
        }
        catch (err) {
          self.catchErrors(err);
        }
      }
    });
  }

  self.list = function() {

    self.parseData(function(capture) {
      self.echo(capture.name + ' capture is valid.');
    });
  }

  /*
   * The function that is executed with "succss add {config.js}"
   */
  self.add = function() {

    self.parseData(function(capture) {
      self.prepareScreenshot(capture);
    });
  }

  /**
   * The function that is executed with "succss check {config.js}"
   */
  self.check = function() {

    var command = function(capture) {

      self.prepareScreenshot(capture);

      casperInstance.then(function() {

        // Writing base and updated HTML images on PhantomJS canvas before passing them to a diff function.
        try {

          var imgLoadCount = 0;

          imgBase = new Image();
          imgCheck = new Image();
          imgBase.src = fs.absolute(capture.basePath);
          // Uses Math.Random() to reset browser's cache between pages requests,
          // useful when comapring pages, using same src for multiple checks.
          imgCheck.src = fs.absolute(capture.filePath+'?reset='+Math.random());

        }
        catch (err) {
          self.catchErrors(err);
        }

        imgBase.onerror = function(e) {
          var errorMsg = '[SucCSS] Base screenshot not found ("' + e.srcElement.src + '). Did you forget to add it ?\n';
          errorMsg += 'Check that the file path is a valid URI with no reserved ($ & + , / : ; = ? @) nor unsafe (" < > # % { } | \ ^ ~ [ ] `) characters.';
          self.catchErrors(errorMsg);
        }

        imgCheck.onerror = function(e) {
          var errorMsg = '[SucCSS] Current screenshot reference not found ("' + e.srcElement.src + '). Check your --checkDir option';
          self.catchErrors(errorMsg);
        }

        imgBase.onload = imgCheck.onload = function() {

          imgLoadCount++;
          if (imgLoadCount == 2) {
            ['resemble', 'imagediff', 'diff'].forEach(function(diff) {
              try {
                // Only calls diff methods enabled in Succss.options:
                if (self[diff] && capture.options[diff] == true) {
                  self[diff].call(self, imgBase, imgCheck, capture);
                }
              }
              catch (e) {
                self.catchErrors(e);
              }
            });
            if (!SuccssCount.remaining) {
              if (!options.checkDir && !options.keepTmp) {
                fs.removeTree(checkDir);
              }
            }
          }
        }
      });
    }
    self.parseData(command);
  }

  /**
   * The parseData function iterates through the pages, captures and viewports objects
   * generated from the javascript configuration during Succss private data initialisation phase.
   * Capture state objects are created for each iteration, then casperjs opens a webbrowser
   * and set the viewport for these. A command is called on each capture state (add, check).
   *
   * @param {Function} command functions from self.add and self.check above.
   * @returns casperInstance.run()
   */
  self.parseData = function(command) {

    casperInstance.start('about:blank', function() {

      SuccssCount.startDate = new Date();
      SuccssCount.startTime = SuccssCount.startDate.getTime();

      casperInstance.each(pages, function(casperInstance, p) {

        self.echo('\nFound "' + p + '" page configuration.', 'INFO');

        SuccssCount.planned += data[p].captureKeys.length*viewports.length;
        SuccssCount.remaining = SuccssCount.planned;

        casperInstance.each(data[p].captureKeys, function(casperInstance, c) {

          casperInstance.each(viewports, function(casperInstance, v) {

            casperInstance.thenOpen(data[p].url, function(){

              try {

                SuccssCount.remaining--;

                var capture = createCaptureState(p, c, v);

                self.echo('\nCapturing "' + capture.page.name + '" ' + capture.name + ' screenshot with ' + v + ' viewport:', 'INFO');
                self.echo('Selector is: "' + capture.selector + '"', 'PARAMETER');
                self.echo('> Opening ' + capture.page.url, 'PARAMETER');

                casperInstance.viewport(capture.viewport.width, capture.viewport.height);

                // Throw on Client (4xx) or Server (5xx) errors.
                if (typeof casperInstance.currentHTTPStatus !== 'number' || casperInstance.currentHTTPStatus > 400) {
                  switch (casperInstance.currentHTTPStatus) {
                    case null:
                      throw "[SucCSS] Can't access " + capture.page.url + ". Check the website url and your internet connexion.";
                      break;
                    default:
                      throw "[SucCSS] Response code for " + capture.page.url + " was " + casperInstance.currentHTTPStatus;
                  }
                }

                command(capture);
              }
              catch(e) {
                self.catchErrors(e);
              }
            });
          });
        });
      });
    }).run();
  }

  /**
   * Captures a screenshot from the data contained in a Succss capture state object.
   *
   * @param {Object} capture state
   */
  self.takeScreenshot = function(captureState) {

    casperInstance.then(function() {
      casperInstance.waitForSelector(captureState.selector, function() {

        // Processing before capture callbacks:
        if (captureState.before) {
          // Siblings are before functions made available in other before functions,
          // see http://succss.ifzenelse.net/configuration#before.
          var siblings = {};
          var pageCaptures = data[captureState.page.name].captures;
          for (var c in pageCaptures) {
            if (c != captureState.name && pageCaptures[c].before) {
              siblings[c] = pageCaptures[c].before.bind(casperInstance, siblings);
            }
          }
          captureState.before.call(casperInstance, siblings);
        }
      }, function() {
        self.echo('Selector "' + captureState.selector + '" was not found anywhere on the page.', 'ERROR');
      });
    });

    // Processing the 'hidden' capture property:
    if (captureState.hidden) {
      var selectors = captureState.hidden;
      casperInstance.thenEvaluate(function(selectors) {
        var elements = document.querySelectorAll(selectors);
        for (var e in elements) {
          elements[e].style.visibility = 'hidden';
        }
      }, { selectors:selectors })
    };

    var imgOptions = {
      format: captureState.options.imgType,
      quality: captureState.options.imgQuality
    };

    // Takes the screenshot with CasperJs:
    casperInstance.then(function() {
      try {
        // Quickfix in case window.scrollTo is called on client side.
        // CasperJS getElementBounds does not do well on capture otherwise.
        casperInstance.evaluate(function() {
          window.scrollTo(0,0);
        })
        self.echo('> ... Saving ' + captureState.name + ' screenshot under ' + captureState.filePath, 'PARAMETER');
        casperInstance.captureSelector(captureState.filePath, captureState.selector, imgOptions);
      }
      catch (err) {
        self.echo(err, 'ERROR');
        self.catchErrors(err);
      }
    });
  }

  /**
   * Succss bundled diffing implementation of imagediff.js
   *
   * @param {HTMLImageElement} image reference
   * @param {HTMLImageElement} updated image
   * @param {Object} capture state
   */
  self.imagediff = function(imgBase, imgCheck, capture) {
    self.injectJs(options.libpath + '/imagediff.js');
    var imagediffOptions = {
      lightness:options.diffLightness,
      align:'top'
    }
    var imagesMatch = imagediff.equal(imgBase, imgCheck, capture.options.tolerancePixels);
    if (!imagesMatch) {
      var filePath = './imagediff/' + self.defaultDiffDirName(capture);
      var imgDiff = imagediff.diff(imgBase, imgCheck, imagediffOptions);
      self.writeImgDiff(imgDiff, imgBase, imgCheck, filePath);
    }
    casper.test.assertTrue(imagesMatch, 'Capture matches base screenshot (imagediff).');
  }

  /**
   * Succss bundled diffing implementation of resemblejs
   *
   * @param {HTMLImageElement} image reference
   * @param {HTMLImageElement} updated image
   * @param {Object} capture state
   */
  self.resemble = function(imgBase, imgCheck, capture) {

    self.injectJs(options.libpath + '/resemble.js');

    resemble(imgBase.src).compareTo(imgCheck.src).onComplete(function(data){
      var imgDiff = new Image();
      imgDiff.src = data.getImageDataUrl();
      imgDiff.onload = function() {

        // Adds 1sec to avoid casper run.complete before image loads.
        self.casper.wait(1000);

        try {
          var imagesMatch = !Math.round(data.misMatchPercentage);
          if (!imagesMatch) {
            var filePath = './resemble/' + self.defaultDiffDirName(capture);
            self.writeImgDiff(imgDiff, imgBase, imgCheck, filePath);
          }
          casper.test.assertTrue(imagesMatch, 'Capture matches base screenshot (resemble).');
        }
        catch (e) {
          self.catchErrors(e);
        }
      }
    });
  }

  /**
   * Writes an image to a HTML5 Canvas, assembled from images differences (imgDiff) between the original and updated images,
   * then saves it.
   *
   * @param {ImageData|HTMLImageElement} imgDiff The diff html image or image data output from any library: imagediff, resemble...
   * @param {HTMLImageElement} imgBase The original image.
   * @param {HTMLImageElement} imgCheck The updated image.
   * @param {String} filePath for saving the composed image.
   */
  self.writeImgDiff = function(imgDiff, imgBase, imgCheck, filePath) {
    var canvas = document.createElement('canvas');
    var headerHeight = 50;
    var borderWidth = 1;
    if (imgBase.width < 150) {
      imgBase.width = 150;
    }
    if (imgBase.width < imgCheck.width) {
      imgBase.width = imgCheck.width;
    }
    if (imgBase.height < imgCheck.height) {
      imgBase.height = imgCheck.height;
    }
    canvas.width = imgBase.width * 3;
    canvas.height = imgBase.height + headerHeight;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(imgBase.width, 0);
    ctx.lineTo(imgBase.width, headerHeight);
    ctx.lineTo(imgBase.width+borderWidth, headerHeight);
    ctx.lineTo(imgBase.width+borderWidth, 0);
    ctx.lineTo(imgBase.width, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(imgBase.width*2, 0);
    ctx.lineTo(imgBase.width*2, headerHeight);
    ctx.lineTo(imgBase.width*2+borderWidth, headerHeight);
    ctx.lineTo(imgBase.width*2+borderWidth, 0);
    ctx.lineTo(imgBase.width*2, 0);
    ctx.fill();
    var imgDiffType = imgDiff.toString();
    if (imgDiffType == '[object ImageData]') {
      ctx.putImageData(imgDiff, 0, headerHeight);
    }
    else if (imgDiffType == '[object HTMLImageElement]') {
      ctx.drawImage(imgDiff, 0, headerHeight);
    }
    else {
      casper.test.error('Unable to write image diff file, unknown diff image type (' + imgDiffType + ')');
    }
    ctx.drawImage(imgBase, imgBase.width+borderWidth, headerHeight);
    ctx.drawImage(imgCheck, (imgBase.width+borderWidth)*2, headerHeight);
    ctx.font = "bold 35px Arial";
    ctx.fillText("Diff", 10, headerHeight/1.4);
    ctx.fillText("Base", imgBase.width + 10, headerHeight/1.4);
    ctx.fillText("Update", imgBase.width*2 + 10, headerHeight/1.4);
    var data = canvas.toDataURL("image/jpeg", options.diffQuality/100).split(",")[1];
    fs.write(filePath, atob(data),'wb');
    self.echo('The diff image has been written in : ' + filePath, 'INFO');
  }

  /**
   * @param {Object} capture state
   * @returns {String} The default path for writing diff images.
   */
  self.defaultDiffDirName = function(capture) {
    return SuccssCount.startDate.getFullYear() + '-' +
            (SuccssCount.startDate.getMonth() + 1) + '-' +
            SuccssCount.startDate.getDate() + '--' +
            SuccssCount.startDate.getHours() + '-' +
            SuccssCount.startDate.getMinutes() + '-' +
            SuccssCount.startDate.getSeconds() +
            '/' + capture.page.name + '--' + capture.viewport.name +
            '/' + capture.basePath.replace(/^\.?\//, '').replace(checkDir+'/', '');
  }

  /**
   * Increments the current Succss run error count, print the related message.
   * @param {String} error message
   */
  self.catchErrors = function(err) {
    SuccssCount.failures++;
    self.echo(err, 'ERROR');
  }

  /**
   * Injects a javascript file with PhantomJs, only once.
   * @param {String} filePath
   */
  self.injectJs = function(filePath) {
    if (injectedJSFiles.indexOf(filePath) == -1) {
      var loaded = phantom.injectJs(filePath);
      if (loaded) {
        injectedJSFiles.push(filePath);
      }
      else {
        self.catchErrors('Unable to load script file: ' + filePath);
      }
    }
  }

  return self;
}

/**
 * Prepend a filepath, removes double slashes and "current directory" dots.
 *
 * @param {String} path used as a prefix
 * @param {String} dir used as a suffix
 * @returns {String} the resulting filepath
 */
function cleanPreprendPath(prefix, suffix) {
  return prefix.replace(/\/$/, '') + '/' + suffix.replace(/^(\.\/|\/)/, '');
}