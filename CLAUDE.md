# RAF Copilot

An helper webpage to use during ultra cycling events for finding
points of interest easily.

## Overall plan

The goal is pretty simple:

- Have an app as portable as possible: a web app
- Store all data locally: works without good internet
- Use geo-location to display relevant information
- Minimalist design

We already have a GPS for tracking our fitness and effort,
what's missing is information like:

- how far is next water / toilet / food
- how far afterward are the next in case we miss it

## Data source

- The official race GPX will be given as source, including a list of waypoints

The goal is to load this into local storage, including the whole app code, and then run purely offline, showing a simple timeline with upcoming waypoints.

## Implementation requirements

- On the server side, we need something to serve:
    - The code of the web app
    - The GPX data, either directly to be worked on in pure front, or pre-processed.
- On the frontend side, there should be 2 views main views:
    - One for settings, including the kind of waypoints we want to show
    - One with some "timeline", showing upcoming POI and their distance

Once all data is loaded on the frontend side, the frontend should pre-calculate based on the course of the GPX at which kilometer from the start a POI is available, and do that only once, caching the results.
Then on each location update from the GPS, the app should determine where on the trace we are exactly,
and from there extrapolate the upcoming POIs.

So each time we hit refresh, it only request the location and works locally!

## Tech to use

TBD

## Steps to implement

TBD