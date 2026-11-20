import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// Declared at module level so the brush functions can use them too
let xScale;
let yScale;

async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line), // or just +row.line
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));

  return data;
}

function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      let first = lines[0];
      let { author, date, time, timezone, datetime } = first;
      let ret = {
        id: commit,
        url: 'https://github.com/EllaLi86/portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        // Hour as a decimal, e.g. 2:30 PM = 14.5
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      Object.defineProperty(ret, 'lines', {
        value: lines,
        enumerable: false, // hidden from console.log, for...in, Object.keys
        writable: false, // can't be reassigned
        configurable: false, // can't be deleted or redefined
      });

      return ret;
    })
    // Oldest first, so the story (and "my first commit") is in time order
    .sort((a, b) => a.datetime - b.datetime);
}

function timeOfDay(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 21) return 'Evening';
  return 'Night';
}

function renderCommitInfo(data, commits) {
  // Create the dl element
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  // Add total LOC
  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(data.length);

  // Add total commits
  dl.append('dt').text('Total commits');
  dl.append('dd').text(commits.length);

  // Number of files
  // [[file, numberOfLines], ...] — a file's length is its highest line number
  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (d) => d.line),
    (d) => d.file,
  );
  dl.append('dt').text('Files');
  dl.append('dd').text(fileLengths.length);

  // Longest file (in lines)
  const [longestFile, longestFileLength] = d3.greatest(fileLengths, (d) => d[1]);
  dl.append('dt').text('Longest file');
  dl.append('dd').text(longestFileLength).attr('title', longestFile);

  // Average line length (in characters)
  dl.append('dt').text('Avg line length');
  dl.append('dd').text(d3.mean(data, (d) => d.length).toFixed(1));

  // Maximum indentation depth
  dl.append('dt').text('Max depth');
  dl.append('dd').text(d3.max(data, (d) => d.depth));

  // Time of day when the most lines were written
  const periods = d3.rollups(
    data,
    (v) => v.length,
    (d) => timeOfDay(d.datetime),
  );
  dl.append('dt').text('Peak time');
  dl.append('dd').text(d3.greatest(periods, (d) => d[1])?.[0]);

  // Day of the week when the most lines were written
  const days = d3.rollups(
    data,
    (v) => v.length,
    (d) => d.datetime.toLocaleString('en', { weekday: 'long' }),
  );
  dl.append('dt').text('Busiest day');
  dl.append('dd').text(d3.greatest(days, (d) => d[1])?.[0]);
}

function renderTooltipContent(commit) {
  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const time = document.getElementById('commit-hour');
  const author = document.getElementById('commit-author');
  const lines = document.getElementById('commit-lines');

  if (Object.keys(commit).length === 0) return;

  link.href = commit.url;
  link.textContent = commit.id;
  date.textContent = commit.datetime?.toLocaleString('en', {
    dateStyle: 'full',
  });
  time.textContent = commit.datetime?.toLocaleString('en', {
    timeStyle: 'short',
  });
  author.textContent = commit.author;
  lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.style.left = `${event.clientX}px`;
  tooltip.style.top = `${event.clientY}px`;
}

function renderScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([0, width])
    .nice();

  yScale = d3.scaleLinear().domain([0, 24]).range([height, 0]);

  // Leave room around the plot for the axes
  const margin = { top: 10, right: 10, bottom: 60, left: 20 };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  // Update scales with new ranges (must happen before the dots are positioned)
  xScale.range([usableArea.left, usableArea.right]);
  yScale.range([usableArea.bottom, usableArea.top]);

  // Add gridlines BEFORE the dots and axes, so they're drawn underneath
  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);

  // Gridlines are an axis with no labels and full-width ticks
  gridlines.call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  // Color each gridline by its hour: blue at night, orange in the daytime
  const timeColor = d3
    .scaleLinear()
    //       midnight   dawn       morning    noon       sunset     dusk       midnight
    .domain([0,         6,         8,         12,        18,        20,        24])
    .range(['#2c4a9a', '#7fa8e0', '#f5c35a', '#f39c32', '#e8743c', '#7a5aa6', '#2c4a9a']);

  // Each tick's data (d) is its hour value: 0, 2, 4 ... 24
  gridlines.selectAll('.tick line').attr('stroke', (d) => timeColor(d));

  // Dot size encodes how many lines each commit edited
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  // Square-root scale so circle AREA (not radius) is proportional to lines edited
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  // Draw large dots first so small ones end up on top and stay hoverable
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  const dots = svg.append('g').attr('class', 'dots');

  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id) // key by commit id so each commit keeps its own <circle>
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7) // Transparency so overlapping dots stay visible
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1); // Full opacity on hover
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });

  // Create the axes
  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  // Add X axis (class lets updateScatterPlot find it again)
  const xAxisGroup = svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .attr('class', 'x-axis')
    .call(xAxis);
  tiltAxisLabels(xAxisGroup);

  // Add Y axis
  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .attr('class', 'y-axis') // just for consistency
    .call(yAxis);

  // Brush goes last, once everything else is in the SVG
  createBrushSelector(svg);
}

// Tilt the x-axis labels so neighbouring ones (e.g. "Sat 31" / "November") don't overlap
function tiltAxisLabels(axisGroup) {
  axisGroup
    .selectAll('text')
    .attr('transform', 'rotate(-35)')
    .attr('text-anchor', 'end')
    .attr('dx', '-0.4em')
    .attr('dy', '0.6em');
}

// Redraws the x-axis and dots of the EXISTING scatterplot for a new set of commits
// (renderScatterPlot would append a whole new <svg> every time)
function updateScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 60, left: 20 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  // Reuse the svg that renderScatterPlot created
  const svg = d3.select('#chart').select('svg');

  // Only the x domain changes; the y scale (hours 0–24) stays the same
  xScale = xScale.domain(d3.extent(commits, (d) => d.datetime)).nice();

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  const xAxis = d3.axisBottom(xScale);

  // Clear out the old x-axis and draw the new one in the same <g>
  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(xAxis);
  tiltAxisLabels(xAxisGroup);

  const dots = svg.select('g.dots');

  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);
  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id) // key by commit id so each commit keeps its own <circle>
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7) // Transparency so overlapping dots stay visible
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1); // Full opacity on hover
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}

function createBrushSelector(svg) {
  // Create brush
  svg.call(d3.brush().on('start brush end', brushed));

  // Raise dots and everything after overlay, so the overlay
  // sits underneath and the dots can still be hovered
  svg.selectAll('.dots, .overlay ~ *').raise();
}

function brushed(event) {
  const selection = event.selection;
  d3.selectAll('circle').classed('selected', (d) =>
    isCommitSelected(selection, d),
  );
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];

  const countElement = document.querySelector('#selection-count');
  countElement.textContent = `${
    selectedCommits.length || 'No'
  } commits selected`;

  return selectedCommits;
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }
  const requiredCommits = selectedCommits.length ? selectedCommits : commits;
  const lines = requiredCommits.flatMap((d) => d.lines);

  // Use d3.rollup to count lines per language
  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  // Always show the same languages in the same order, so the layout stays
  // fixed while brushing (a language with no lines in the selection shows 0)
  const languages = ['css', 'js', 'html'];

  container.innerHTML = languages
    .map((language) => {
      const count = breakdown.get(language) ?? 0;
      const formatted = d3.format('.1~%')(count / lines.length);

      return `
        <dt>${language}</dt>
        <dd>
          <span class="lang-count">${count} lines</span>
          <span class="lang-percent">${formatted}</span>
        </dd>
      `;
    })
    .join('');
}

function isCommitSelected(selection, commit) {
  if (!selection) {
    return false;
  }

  // selection is [[x0, y0], [x1, y1]] in pixels: top-left and bottom-right corners
  const [[x0, y0], [x1, y1]] = selection;

  // Where this commit's dot is drawn, in the same pixel space
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);

  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

let data = await loadData();
let commits = processCommits(data);

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);


// Color per technology (css, js, html...). Created once, outside updateFileDisplay,
// so each type keeps the same color on every update
let colors = d3.scaleOrdinal(d3.schemeTableau10);

// Lists every file touched by the given commits, with its line count
function updateFileDisplay(filteredCommits) {
  // All lines from these commits, grouped by file
  let lines = filteredCommits.flatMap((d) => d.lines);
  let files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => {
      return { name, lines };
    })
    // Biggest file first, so the list reads like a race
    .sort((a, b) => b.lines.length - a.lines.length);

  // One <div> per file, keyed by file name so each file keeps its own div
  let filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join(
      // This code only runs when the div is initially rendered
      (enter) =>
        enter.append('div').call((div) => {
          div.append('dt');
          div.append('dd');
        }),
    );

  // This code updates the div info: file name, with its line count underneath
  filesContainer
    .select('dt')
    .html((d) => `<code>${d.name}</code><small>${d.lines.length} lines</small>`);

  // Unit visualization: one dot (div.loc) per line of code in the file
  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${colors(d.type)}`);
}

updateFileDisplay(commits); // start with every file shown

// ---------- Scrollytelling ----------
// Every commit made up to (and including) the given commit
function commitsUntil(commit) {
  return commits.filter((d) => d.datetime <= commit.datetime);
}

// Fills a story column with one .step paragraph per commit
function renderStory(selector) {
  d3.select(selector)
    .selectAll('.step')
    .data(commits)
    .join('div')
    .attr('class', 'step')
    .html(
      (d, i) => `
        On ${d.datetime.toLocaleString('en', {
          dateStyle: 'full',
          timeStyle: 'short',
        })},
        I made <a href="${d.url}" target="_blank">${
          i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'
        }</a>.
        I edited ${d.totalLines} lines across ${
          d3.rollups(
            d.lines,
            (D) => D.length,
            (d) => d.file,
          ).length
        } files.
        Then I looked over all I had made, and I saw that it was very good.
      `,
    );
}

// Scrolly 1: the scatterplot grows as you scroll through the commits
renderStory('#scatter-story');

function onStepEnter(response) {
  const commit = response.element.__data__; // D3 stored the commit on the element
  updateScatterPlot(data, commitsUntil(commit));
}

const scroller = scrollama();
scroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
  })
  .onStepEnter(onStepEnter);

// Scrolly 2: the file sizes grow as you scroll through the commits again
renderStory('#files-story');

function onFilesStepEnter(response) {
  const commit = response.element.__data__;
  updateFileDisplay(commitsUntil(commit));
}

const filesScroller = scrollama();
filesScroller
  .setup({
    container: '#scrolly-2',
    step: '#scrolly-2 .step',
  })
  .onStepEnter(onFilesStepEnter);
