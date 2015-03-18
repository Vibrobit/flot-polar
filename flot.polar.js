/*
Vibrobit, 2013 Nick Serebrennikov with portions of flot.pie plugin
*/
/* Flot plugin for rendering pie charts.

Copyright (c) 2007-2013 IOLA and Ole Laursen.
Licensed under the MIT license.

The plugin assumes that each series has a single data value, and that each
value is a positive integer or zero.  Negative numbers don't make sense for a
pie chart, and have unpredictable results.  The values do NOT need to be
passed in as percentages; the plugin will calculate the total and per-slice
percentages internally.

* Created by Brian Medendorp

* Updated with contributions from btburnett3, Anthony Aragues and Xavi Ivars

The plugin supports these options:

series: {
pie: {
show: true/false
radius: 0-1 for percentage of fullsize, or a specified pixel length, or 'auto'
innerRadius: 0-1 for percentage of fullsize or a specified pixel length, for creating a donut effect
startAngle: 0-2 factor of PI used for starting angle (in radians) i.e 3/2 starts at the top, 0 and 2 have the same result
tilt: 0-1 for percentage to tilt the pie, where 1 is no tilt, and 0 is completely flat (nothing will show)
offset: {
top: integer value to move the pie up or down
left: integer value to move the pie left or right, or 'auto'
},
stroke: {
color: any hexidecimal color value (other formats may or may not work, so best to stick with something like '#FFF')
width: integer pixel width of the stroke
},
label: {
show: true/false, or 'auto'
formatter:  a user-defined function that modifies the text/style of the label text
radius: 0-1 for percentage of fullsize, or a specified pixel length
background: {
color: any hexidecimal color value (other formats may or may not work, so best to stick with something like '#000')
opacity: 0-1
},
threshold: 0-1 for the percentage value at which to hide labels (if they're too small)
},
combine: {
threshold: 0-1 for the percentage value at which to combine slices (if they're too small)
color: any hexidecimal color value (other formats may or may not work, so best to stick with something like '#CCC'), if null, the plugin will automatically use the color of the first slice to be combined
label: any text value of what the combined slice should be labeled
}
highlight: {
opacity: 0-1
}
}
}

More detail and specific examples can be found in the included HTML file.

*/

(function ($) {
	'use strict';
	function init(plot) {

		var canvas = null;
		var target = null;
		var maxRadius = null;
		var centerLeft = null;
		var centerTop = null;
		var polarOffset = 0;

		var ctx = null;

		// interactive variables

		var highlights = [];

		// add hook to determine if polar plugin in enabled, and then perform necessary operations

		plot.hooks.processOptions.push(function (plot, options) {
			if (options.series.polar.show) {
				options.grid.show = false;
			}

		});

		plot.hooks.bindEvents.push(function (plot, eventHolder) {
			var opts = plot.getOptions();
			if (opts.series.polar.show) {
				if (opts.grid.hoverable) {
					eventHolder.unbind("mousemove").mousemove(onMouseMove);
				}
				if (opts.grid.clickable) {
					eventHolder.unbind("click").click(onClick);
				}
			}
		});

		plot.hooks.processDatapoints.push(function (plot, series, data, datapoints) {
			var opts = plot.getOptions();
			if (opts.series.polar.show) {
				if (opts.series.polar.polarOffset) {
					polarOffset = opts.series.polar.polarOffset;
				}
				processDatapoints(plot, series, data, datapoints);
			}
		});

		plot.hooks.draw.push(function (plot, newCtx) {
			var opts = plot.getOptions();
			if (opts.series.polar.show) {
				draw(plot, newCtx);
			}
		});

		plot.getCursorPolar = function (plot, crosshair) {
			var pos = fromOrto(crosshair.x - drawingCtx.centerLeft, crosshair.y - drawingCtx.centerTop, drawingCtx.scale);
			return pos;
		};

		plot.drawCursorPolar = function (plot, ctx, crosshair) {
			prepareContext(plot, ctx); //place (0,0) into center of plot area

			var pos = fromOrto(crosshair.x - drawingCtx.centerLeft, crosshair.y - drawingCtx.centerTop, drawingCtx.scale);
			if (pos.r >= drawingCtx.maxRadius) {
				return;
			}
			drawRadiusMark(ctx, pos.r, drawingCtx.scale, null, 1, true);
			drawAngleMark(ctx, pos.phi, drawingCtx.maxRadius, null, 1, vm.utils.formatNum(pos.phi, '#0.00'), true);
		};

		function processDatapoints(plot, series, datapoints) {
			canvas = plot.getCanvas();
			target = $(canvas).parent();
			options = plot.getOptions();
		}

		function toOrto(p, scale) {
			var r = p[0] * scale;
			var phi = (p[1] + polarOffset + 90) * Math.PI / 180; //rad
			return {
				x: r * Math.sin(phi),
				y: r * Math.cos(phi)
			};
		}


		function fromOrto(x, y, scale) {
			var r = Math.sqrt(x * x + y * y);
			var polar = {
				r: r,
				phi: Math.atan2(x, y) * 180.0 / Math.PI//deg
			};
			polar.phi = polar.phi - polarOffset - 90;
			if (polar.phi < 0) {
				polar.phi = 360 + polar.phi;
			}
			return polar;
		}

		var drawingCtx = { valid: false }; //object to hold some setup for drawing depending on the data, updated after redraw

		function prepareContext(plot, ctx) {
			if (!drawingCtx.valid) {
				var canvasWidth = plot.getPlaceholder().width();
				var canvasHeight = plot.getPlaceholder().height();

				// calculate maximum radius and center point

				maxRadius = Math.min(canvasWidth - options.series.polar.textSize * 2, canvasHeight) / 2;
				centerTop = canvasHeight / 2 + options.series.polar.offset.top;
				centerLeft = canvasWidth / 2;

				if (options.series.polar.offset.left !== "auto") {
					centerLeft += options.series.polar.offset.left;
				}

				if (centerLeft < maxRadius) {
					centerLeft = maxRadius;
				} else if (centerLeft > canvasWidth - maxRadius) {
					centerLeft = canvasWidth - maxRadius;
				}
				drawingCtx.centerLeft = centerLeft;
				drawingCtx.centerTop = centerTop;
				//store context state for usage in overlay redraws
				drawingCtx.maxRadius = maxRadius;

				var series = plot.getData();

				var maxX = 1;
				for (var i = 0; i < series.length; i++) {
					if (maxX < series[i].xaxis.max) {
						maxX = series[i].xaxis.max;
					}
				}
				drawingCtx.maxX = maxX;
				var opts = plot.getOptions();
				drawingCtx.stepsAng = opts.series.polar.angleSubdivision;
				drawingCtx.scale = drawingCtx.maxRadius / drawingCtx.maxX;
				drawingCtx.angStep = 360 / drawingCtx.stepsAng;
				drawingCtx.stepsR = fitRadialMarks(ctx, drawingCtx.maxRadius, drawingCtx.scale, maxX, opts.series.polar.radialMarksSpacing);

				drawingCtx.rStep = drawingCtx.maxRadius / drawingCtx.stepsR;


				drawingCtx.valid = true;

			}

			ctx.translate(drawingCtx.centerLeft, drawingCtx.centerTop);
		}

		function fitRadialMarks(ctx, maxRadius, scale, maxX, radialMarksSpacing) {
			var result = 0;
			var oSpace = 0; //occupied space
			while (oSpace < maxRadius) {
				oSpace = 0;
				result++; //increment
				var rStep = maxRadius / result;
				for (var i = 1; i <= result; i++) {
					var radius = rStep * i;
					var label = vm.utils.formatNum(radius / scale, '#0.00');
					var labelWidth = ctx.measureText(label).width;
					oSpace += labelWidth + radialMarksSpacing;
				}
				oSpace += radialMarksSpacing * (result - 1);
			}
			return Math.ceil(Math.max(result - 1, 1));
		}

		function draw(plot, newCtx) {

			if (!target) {
				return; // if no series were passed
			}
			var ctx = newCtx;
			ctx.save();
			drawingCtx.valid = false; //TODO: set this when data gets updated or canvas size changes
			prepareContext(plot, ctx);
			var series = plot.getData();

			var opts = plot.getOptions();
			drawBackground(ctx, opts.grid.backgroundColor, drawingCtx.maxRadius);
			//draw equal radius:
			for (var i = 1; i <= drawingCtx.stepsR; i++) {
				drawRadiusMark(ctx, drawingCtx.rStep * i, drawingCtx.scale, opts.grid.markingsColor, opts.grid.markingsLineWidth / 2);
			}
			//draw angles:
			for (i = 0; i < drawingCtx.stepsAng; i++) {
				drawAngleMark(ctx, (drawingCtx.angStep * i) - polarOffset, drawingCtx.maxRadius, opts.grid.markingsColor, opts.grid.markingsLineWidth / 2);
			}

			for (i = 0; i < series.length; i++) {
				plot.drawSerie(ctx, series[i], false, opts.series.lines.lineWidth);
			}

			ctx.restore();

		} // end draw function

		function drawBackground(ctx, color, radius) {
			ctx.save();
			if (color) {
				ctx.fillStyle = color;
			}
			ctx.beginPath();

			ctx.arc(0, 0, radius, 0, 2 * Math.PI);
			ctx.fill();
			ctx.restore();
		}

		function drawRadiusMark(ctx, radius, scale, color, lineWidth, withBackground) {
			if (color) {
				ctx.strokeStyle = color;
			}
			ctx.lineJoin = "round";
			ctx.lineWidth = lineWidth;
			ctx.beginPath();
			ctx.arc(0, 0, radius, 0, 2 * Math.PI);
			ctx.stroke();
			var p = toOrto([radius, -polarOffset], 1);
			var label = vm.utils.formatNum(radius / scale, '#0.00');
			drawLabel(ctx, label, p.x, p.y + options.series.polar.textSize, color, withBackground);
		}

		function drawAngleMark(ctx, angle, radius, color, lineWidth, label, withBackground) {
			if (color) {
				ctx.strokeStyle = color;
			}
			if (angle < 0) {
				angle = 360 + angle;
			}
			ctx.lineJoin = "round";
			ctx.lineWidth = lineWidth;
			ctx.beginPath();
			ctx.moveTo(0, 0);
			var p = toOrto([radius, angle], 1);
			ctx.lineTo(p.x, p.y);
			ctx.stroke();
			p = toOrto([radius, angle], 1);
			if (typeof (label) === 'undefined') {
				label = angle;
			}
			drawLabel(ctx, label, p.x, p.y, color, withBackground);
		}

		function drawLabel(ctx, text, x, y, color, withBackground) {
			ctx.save();
			if (color) {
				ctx.strokeStyle = color;
			}
			ctx.font = options.series.polar.textSize + "px Arial";
			var labelHalfWidth = ctx.measureText(text).width / 2;
			ctx.save();

			if (withBackground) {
				ctx.save();
				ctx.beginPath();
				var padding = options.series.polar.textSize / 5;
				ctx.rect(x - labelHalfWidth - padding, y + padding, labelHalfWidth * 2 + padding * 2, -options.series.polar.textSize - padding * 2);
				ctx.fillStyle = 'rgba(255, 255, 188, 1.0)';
				ctx.fill();
				ctx.beginPath();
				ctx.restore();
			}

			ctx.lineWidth = 2;
			ctx.strokeStyle = 'white';
			ctx.strokeText(text, x - labelHalfWidth + ctx.lineWidth / 2, y);
			ctx.restore();
			ctx.fillText(text, x - labelHalfWidth, y);
			ctx.restore();
		}

		function createSegment(p1, p2) {
			var a = p1;
			var b = p2;

			var lengthInDeg = p2[1] - p1[1];

			if (lengthInDeg < -180) {
				lengthInDeg = lengthInDeg + 360;
			} else if (lengthInDeg > 180) {
				lengthInDeg = -360 + lengthInDeg;
			}
			var res = [a, b, lengthInDeg];
			return res;
		}

		function distance(a, b) {
			var radius = Math.max(a[0], b[0]);
			var deltaPhi = a[1] - b[1];
			return Math.abs(deltaPhi / 180 * Math.PI * radius);
		}

		plot.drawSerie = function (ctx, points, color, lineWidth) {
			ctx.save();
			var scale = drawingCtx.scale;
			// draw series
			ctx.strokeStyle = points.color;
			if (color) {
				ctx.translate(drawingCtx.centerLeft, drawingCtx.centerTop);
				ctx.strokeStyle = color;
			}
			ctx.lineJoin = "round";

			if (typeof (lineWidth) !== 'undefined') {
				ctx.lineWidth = lineWidth;
			} else {
				ctx.lineWidth = 1;
			}

			var minSegmentLenInDeg = 5;
			for (var i = 0; i < points.data.length - 1; i++) {
				var segment = createSegment(points.data[i], points.data[i + 1]);
				var p1 = segment[0];
				var p2 = segment[1];
				var p1o = toOrto(p1, scale);
				var p2o = toOrto(p2, scale);
				ctx.beginPath();
				ctx.moveTo(p1o.x, p1o.y);
				if (Math.abs(segment[2]) > minSegmentLenInDeg) {
					//todo: subdivide
					var subdivisionSteps = Math.ceil(Math.abs(segment[2]) / (minSegmentLenInDeg)) + 1;
					var diffRaw = [(p2[0] - p1[0]), segment[2]];
					var step = [diffRaw[0] / subdivisionSteps, diffRaw[1] / subdivisionSteps];
					for (var j = 1; j < subdivisionSteps; j++) {
						var midPoint = [p1[0] + step[0] * j, p1[1] + step[1] * j];
						var midPointOrto = toOrto(midPoint, scale);
						ctx.lineTo(midPointOrto.x, midPointOrto.y);
					}
				}

				ctx.lineTo(p2o.x, p2o.y);
				ctx.stroke();

			}
			ctx.stroke();
			ctx.restore();
		}; // end drawSerie function

	} // end init (plugin body)

	// define polar specific options and their default values

	var options = {
		series: {
			polar: {
				textSize: 11,
				show: false,
				radius: "auto", // actual radius of the visible pie (based on full calculated radius if <=1, or hard pixel value)
				offset: {
					top: 0,
					left: "auto"
				},
				stroke: {
					color: "#fff",
					width: 1
				},
				radialMarksSpacing: 3,
				angleSubdivision: 8
			}
		}
	};

	$.plot.plugins.push({
		init: init,
		options: options,
		name: "polar",
		version: "0.1"
	});

})(jQuery);
