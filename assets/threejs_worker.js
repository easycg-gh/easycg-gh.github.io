var model;
var clock = new THREE.Clock();
var mixers = [];

function isMobile() {
    return /Android|mobile|iPad|iPhone/i.test(navigator.userAgent);
}

var interpolationFactor = 24;

var trackedMatrix = {
    // for interpolation
    delta: [
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0
    ],
    interpolated: [
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0
    ]
}

var markers = {
    marker: {
        width: 1637,
        height: 2048,
        dpi: 215,
        url: "/data/marker",
    }
};

var mixers = [];

var shownOnce = false;

var glass, beer;

var durationGlass;

var setMatrix = function (matrix, value) {
    var array = [];
    for (var key in value) {
        array[key] = value[key];
    }
    if (typeof matrix.elements.set === "function") {
        matrix.elements.set(array);
    } else {
        matrix.elements = [].slice.call(array);
    }
};

function start( container, marker, video, input_width, input_height, canvas_draw, render_update, track_update) {
    var vw, vh;
    var sw, sh;
    var pscale, sscale;
    var w, h;
    var pw, ph;
    var ox, oy;
    var worker;
    var camera_para = '/data/data/camera_para.dat'

    var canvas_process = document.createElement("canvas");
    var context_process = canvas_process.getContext("2d");

    var renderer = new THREE.WebGLRenderer({
        canvas: canvas_draw,
        alpha: true,
        antialias: true,
        precision: 'mediump'
    });
    renderer.setPixelRatio(window.devicePixelRatio);

    var scene = new THREE.Scene();

    var camera = new THREE.Camera();
    camera.matrixAutoUpdate = false;

    scene.add(camera);

    var light = new THREE.AmbientLight(0xffffff);
    scene.add(light);

    var root = new THREE.Object3D();
    scene.add(root);

    /* Load Model */
    var threeGLTFLoader = new THREE.GLTFLoader();

    var objPositions;

    threeGLTFLoader.load("/models/beer.glb", function (gltf) {
        model = gltf.scene;
        model.name = "Duck";
        model.scale.set(1500, 1500, 1500);
        model.rotation.x = Math.PI/2;

        var show = gltf.animations[1];
        var wait = gltf.animations[0];
        var mixer = new THREE.AnimationMixer(model);

        mixers.push(mixer);
        glass = mixer.clipAction(show);
        beer = mixer.clipAction(wait);

        durationGlass = show.duration;
        console.log(show);

        glass.setLoop(THREE.LoopOnce);
        glass.clampWhenFinished = true
        beer.setLoop(THREE.LoopOnce);
        beer.clampWhenFinished = true;

        root.matrixAutoUpdate = false;
        root.add(model);
    });


    var load = function() {
        vw = input_width;
        vh = input_height;

        pscale = 320 / Math.max(vw, (vh / 3) * 4);
        sscale = isMobile() ? window.outerWidth / input_width : 1;

        sw = vw * sscale;
        sh = vh * sscale;
        // video.style.width = sw + "px";
        // video.style.height = sh + "px";
        // container.style.width = sw + "px";
        // container.style.height = sh + "px";
        // canvas_draw.style.clientWidth = sw + "px";
        // canvas_draw.style.clientHeight = sh + "px";
        // canvas_draw.width = sw;
        // canvas_draw.height = sh;
        w = vw * pscale;
        h = vh * pscale;
        pw = Math.max(w, (h / 3) * 4);
        ph = Math.max(h, (w / 4) * 3);
        ox = (pw - w) / 2;
        oy = (ph - h) / 2;
        canvas_process.style.clientWidth = pw + "px";
        canvas_process.style.clientHeight = ph + "px";
        canvas_process.width = pw;
        canvas_process.height = ph;

        renderer.setSize(sw, sh);

        worker = new Worker('/assets/artoolkit_pos.worker.js');

        worker.postMessage({
            type: "load",
            pw: pw,
            ph: ph,
            camera_para: camera_para,
            marker: marker.url
        });

        worker.onmessage = function(ev) {
            var msg = ev.data;
            switch (msg.type) {
                case "loaded": {
                    var proj = JSON.parse(msg.proj);
                    var ratioW = pw / w;
                    var ratioH = ph / h;
                    proj[0] *= ratioW;
                    proj[4] *= ratioW;
                    proj[8] *= ratioW;
                    proj[12] *= ratioW;
                    proj[1] *= ratioH;
                    proj[5] *= ratioH;
                    proj[9] *= ratioH;
                    proj[13] *= ratioH;
                    setMatrix(camera.projectionMatrix, proj);
                    break;
                }

                case "endLoading": {
                    if (msg.end == true) {
                        // removing loader page if present
                        var loader = document.getElementById('loading');
                        if (loader) {
                            loader.querySelector('.loading-text').innerText = 'Start the tracking!';
                            setTimeout(function(){
                                loader.parentElement.removeChild(loader);
                            }, 2000);
                        }
                    }
                    break;
                }

                case "found": {
                    found(msg);
                    break;
                }
                case "not found": {
                    found(null);
                    break;
                }
            }
            track_update();
            process();
        };
    };

    var world;

    var found = function(msg) {
        if (!msg) {
            world = null;
        } else {
            world = JSON.parse(msg.matrixGL_RH);

            // ~nicolocarpignoli this is absolutely based on empirics. Have to test with other 3D models and
            // other different images, possibly with different aspect ratio
            if (!window.firstPositioning) {
                window.firstPositioning = true;
                model.position.y = (msg.height / msg.dpi * 2.54 * 10)/2.0;
                model.position.x = (msg.width / msg.dpi * 2.54 * 10)/2.0;
            }

            if (!shownOnce) {
                if (glass !== undefined) {
                    glass.play();
                }
                setTimeout(() => {
                    shownOnce = true;
                    glass.reset();
                    beer.play();
                }, durationGlass)
            }

            // console.log("NFT width: ", msg.width);
            // console.log("NFT height: ", msg.height);
            // console.log("NFT dpi: ", msg.dpi);
            // var o_view = scene.getObjectByName('Duck');
            // console.log(o_view);
        }
    };

    var lasttime = Date.now();
    var time = 0;

    function process() {
        context_process.fillStyle = "black";
        context_process.fillRect(0, 0, pw, ph);
        context_process.drawImage(video, 0, 0, vw, vh, ox, oy, w, h);

        var imageData = context_process.getImageData(0, 0, pw, ph);
        worker.postMessage({ type: "process", imagedata: imageData }, [
            imageData.data.buffer
        ]);
    }

    var tick = function() {
        draw();
        requestAnimationFrame(tick);
        if (mixers.length > 0) {
            for (var i = 0; i < mixers.length; i++) {

                mixers[i].update(clock.getDelta());
            }
        }
    };

    var draw = function() {
        render_update();
        var now = Date.now();
        var dt = now - lasttime;
        time += dt;
        lasttime = now;

        if (!world) {
            root.visible = false;
        } else {
            root.visible = true;

            // interpolate matrix
            for (var i = 0; i < 16; i++) {
                trackedMatrix.delta[i] = world[i] - trackedMatrix.interpolated[i];
                trackedMatrix.interpolated[i] =
                    trackedMatrix.interpolated[i] +
                    trackedMatrix.delta[i] / interpolationFactor;
            }

            // set matrix of 'root' by detected 'world' matrix
            setMatrix(root.matrix, trackedMatrix.interpolated);
        }

        renderer.render(scene, camera);
    };

    load();
    tick();
    process();
}
