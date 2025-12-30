module.exports = function (grunt) {
  grunt.initConfig({

    clean: {
      demo: ["demo/build"]
    },

    terser: {
      dist: {
        options: {
          compress: true,
          mangle: true,
          sourceMap: true
        },
        files: [{
          expand: true,
          cwd: "dist",
          src: ["*.js", "!*.min.js"],
          dest: "dist",
          ext: ".min.js"
        }]
      }
    },

    cssmin: {
      dist: {
        options: {
          sourceMap: true
        },
        files: {
          "dist/cropt.min.css": "src/cropt.css"
        }
      }
    },

    sass: {
      demo: {
        options: { style: "expanded" },
        files: {
          "demo/build/bs-custom.css": "demo/styles.scss"
        }
      }
    },

    copy: {
      demo: {
        files: [
          {
            expand: true,
            cwd: "node_modules/bootstrap/dist/js",
            src: "bootstrap.bundle.min.*",
            dest: "demo/build"
          },
          {
            expand: true,
            cwd: "dist",
            src: ["*.min.js", "*.min.css", "*.d.ts"],
            dest: "demo/build"
          }
        ]
      }
    }

  });

  grunt.loadNpmTasks("grunt-contrib-clean");
  grunt.loadNpmTasks("grunt-terser");
  grunt.loadNpmTasks("grunt-contrib-cssmin");
  grunt.loadNpmTasks("grunt-contrib-sass");
  grunt.loadNpmTasks("grunt-contrib-copy");

  grunt.registerTask("default", [
    "clean",
    "terser",
    "cssmin",
    "sass",
    "copy"
  ]);
};
