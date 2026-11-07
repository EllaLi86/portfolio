import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

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
    });
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
  const time = document.getElementById('commit-time');
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
    .data(sortedCommits)
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

  // Add X axis
  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(xAxis)
    // Tilt the labels so neighbouring ones (e.g. "Sat 31" / "November") don't overlap
    .selectAll('text')
    .attr('transform', 'rotate(-35)')
    .attr('text-anchor', 'end')
    .attr('dx', '-0.4em')
    .attr('dy', '0.6em');

  // Add Y axis
  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(yAxis);

  // Brush goes last, once everything else is in the SVG
  createBrushSelector(svg);
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
