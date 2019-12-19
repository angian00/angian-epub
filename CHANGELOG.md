# CHANGELOG
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).


## [Unreleased]
### Added
- navigate to next/previous section
- navigate to bookmark
- highlight current section in toc
- open last viewed book by default
- show (toggable) metadata view
- make each panel scroll independently
- make all secondary views hideable
- make window size resolution-dependent


### Fixed
- Duplicate bookmarks

## [0.5]
### Added
- this changelog
- use of git
- read toc/content paths from META-INF as per .epub specification
- get epub uuid and rename cache dir accordingly
- isolate global (state) vars
- working toc links
- manage already loaded ebooks:
	- reuse cache
	- save viewing state
- save bookmark

### Fixed
- encoding bug in text view


## [0.4]
### Added
- layout skeleton
- wiring "Choose File..." menu
- unzipping .epub into cache

## [0.3]
### Added
- toc view
- text view

## [0.2]
### Added
- metadata view

## [0.1]
### Added
- Hello world Electron

