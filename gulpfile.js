var gulp = require('gulp');
var loadPlugins = require('gulp-load-plugins');
var path = require('path');

/**
 * High Level Tasks
 */
gulp.task('doc', ['pages']);
gulp.task('lint', ['jshint', 'tslint']);
gulp.task('test', ['coverage', 'lint']);

/**
 * Gulpfile variables
 */
var _, env, globs, val;

/**
 * A gulp lazy loader for plugins
 * @type {Object}
 */
_ = loadPlugins({
  pattern: '{' + [
    'dts-bundle',
    'del',
    'event-stream',
    'glob',
    'gulp-*',
    'typescript-formatter',
  ].join(',') + '}',
  scope: [
    'devDependencies'
  ]
});

/**
 * Runs a function once and caches the value
 * @param  {Function} fn The value constructor
 * @return {Function}    The value accessor
 */
val = function(fn) {
  var value;
  return function() {
    if (value === undefined) {
      value = fn();
    }
    return value;
  };
};

/**
 * Task environment
 * @type {Object}
 */
env = {
  isTest: val(function() {
    return env.task() === 'test';
  }),
  isTravis: val(function() {
    return process.env.TRAVIS !== undefined;
  }),
  name: val(function() {
    return 'tsutil';
  }),
  pagesUrl: val(function() {
    return process.env.PAGES_URL;
  }),
  project: val(function() {
    return _.typescript.createProject({
      declarationFiles: true,
      module: 'commonjs',
      noExternalResolve: true,
      noImplicitAny: true,
      noLib: false,
      removeComments: true,
      sortOutput: false,
      target: 'ES5'
    });
  }),
  task: val(function() {
    return gulp.seq[gulp.seq.length - 1];
  })
};


/**
 * File globs
 * @type {Object}
 */
globs = {
  build: val(function() {
    return '_build';
  }),
  bundle: val(function() {
    return 'index.d.ts';
  }),
  coverage: val(function() {
    return path.join('coverage', '**', 'lcov.info');
  }),
  dist: val(function() {
    return process.cwd();
  }),
  doc: val(function() {
    return 'doc';
  }),
  docs: val(function() {
    return path.join(globs.doc(), '**', '*');
  }),
  dts: val(function() {
    return [
      globs.ts(),
      'lib/**/*.d.ts',
      'typings/**/*.d.ts'
    ];
  }),
  gulp: val(function() {
    return 'gulpfile.js';
  }),
  lib: val(function() {
    return path.join(globs.src(), '**', '*.ts');
  }),
  scripts: val(function() {
    return path.join(globs.build(), globs.src(), '**', '*.js');
  }),
  src: val(function() {
    return 'src';
  }),
  test: val(function() {
    return 'test';
  }),
  tests: val(function() {
    return path.join(globs.build(), globs.test(), '**', '*.js');
  }),
  ts: val(function() {
    return path.join(
      '{' + globs.src() + ',' + globs.test() + '}', '**', '*.ts');
  }),
  types: val(function() {
    return path.join(globs.build(), globs.src(), '**', '*.d.ts');
  }),
};

/**
 * Creates a single type definition for the package
 */
gulp.task('bundle', ['copy'], function() {
  _.dtsBundle.bundle({
    main: globs.bundle(),
    name: env.name(),
    prefix: '',
    removeSource: true
  });
});

/**
 * Cleans the build artifacts
 */
gulp.task('clean', function(callback) {
  _.del([
    globs.build(),
    globs.doc()
  ], callback);
});

/**
 * Copys the scripts into the dist directory
 */
gulp.task('copy', ['scripts'], function() {
  return gulp.src([
    globs.scripts(),
    globs.types()
  ]).pipe(gulp.dest(globs.dist()));
});

/**
 * Reports the coverage to coveralls
 */
gulp.task('coverage', ['spec'], function() {
  return gulp.src(globs.coverage())
    .pipe(_.coveralls());
});

/**
 * Auto format the TypeScript files
 */
gulp.task('format', function(callback) {
  _.glob(globs.ts(), function(err, files) {
    if (err) {
      return callback(err);
    }
    _.typescriptFormatter.processFiles(files, {
      editorconfig: false,
      replace: true,
      tsfmt: false,
      tslint: true
    });
    return callback(null);
  });
});

/**
 * Lint the JavaScript files
 */
gulp.task('jshint', function() {
  return gulp.src(globs.gulp())
    .pipe(_.jshint())
    .pipe(_.jshint.reporter('jshint-stylish'))
    .pipe(_.if(env.isTest(), _.jshint.reporter('fail')));
});

/**
 * Pushes to github pages
 */
gulp.task('pages', ['typedoc'], function() {
  return gulp.src(globs.docs())
    .pipe(_.ghPages({
      remoteUrl: env.pagesUrl()
    }));
});

/**
 * Processes the TypeScript files
 */
gulp.task('scripts', ['clean', 'tslint'], function() {
  var hasError = false;
  var compiler = gulp.src(globs.dts())
    .pipe(_.typescript(env.project()));
  var dts = compiler.dts
    .pipe(gulp.dest(globs.build()));
  var js = compiler.js
    .on('error', function() {
      hasError = true;
    })
    .on('end', function() {
      if (env.isTest() && hasError) {
        process.exit(8);
      }
    })
    .pipe(gulp.dest(globs.build()));
  return _.eventStream.merge(dts, js);
});

/**
 * Run the tests
 */
gulp.task('spec', ['scripts'], function(callback) {
  var reporters = ['text', 'text-summary'];
  if (!env.isTravis()) {
    reporters.push('html');
  }
  gulp.src(globs.scripts())
    .pipe(_.istanbul({
      includeUntested: true
    }))
    .pipe(_.istanbul.hookRequire())
    .on('finish', function() {
      gulp.src(globs.tests())
        .pipe(_.mocha({
          reporter: env.isTravis() ? 'spec' : 'nyan'
        }))
        .pipe(_.istanbul.writeReports())
        .on('end', function() {
          var errOrNull = null;
          var coverage = _.istanbul.summarizeCoverage();
          var incomplete = Object.keys(coverage).filter(function(key) {
            return coverage[key].pct !== 100;
          });
          if (incomplete.length > 0) {
            errOrNull = new Error(
              'Incomplete coverage for ' + incomplete.join(', '));
          }
          callback(errOrNull);
        });
    });
});

/**
 * Lint the TypeScript files
 */
gulp.task('tslint', function() {
  return gulp.src(globs.ts())
    .pipe(_.tslint())
    .pipe(_.tslint.report({
      emitError: env.isTest()
    }));
});

/**
 * Generates documentation
 */
gulp.task('typedoc', ['clean'], function() {
  return gulp.src(globs.lib())
    .pipe(_.typedoc({
      module: 'commonjs',
      name: env.name(),
      out: globs.doc(),
      target: 'ES5',
      theme: 'minimal'
    }));
});
