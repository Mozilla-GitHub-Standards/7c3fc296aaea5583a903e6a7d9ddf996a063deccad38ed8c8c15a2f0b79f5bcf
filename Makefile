#
# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is Weave code.
#
# The Initial Developer of the Original Code is
# Mozilla Corporation
# Portions created by the Initial Developer are Copyright (C) 2008
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
#   Dan Mills <thunder@mozilla.com> (original author)
#
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
#
# ***** END LICENSE BLOCK *****

objdir=dist
stage_dir=$(objdir)/stage
xpi_dir=$(objdir)/xpi

weave_version := 1.1pre1
compatible_version := 1.0rc4
weave_id := {340c2bbc-ce74-4362-90b5-7c26312808ef}

ifeq ($(release_build),)
  xpi_type := dev
  server_url := https://weave-dev.services.mozilla.com/
  server_url := https://auth.services.mozilla.com/
  update_url := https://services.mozilla.com/sync/update.rdf
else
  xpi_type := rel
  server_url := https://auth.services.mozilla.com/
  update_url :=
endif

ifeq ($(update_url),)
  update_url_tag :=
else
  update_url_tag := <em:updateURL>$(update_url)</em:updateURL>
endif

buildid ?= ${WEAVE_BUILDID}
buildid_short := $(buildid)
ifeq ($(buildid),)
  date    := $(shell date -u +%Y%m%d%H%M)
  revid   := $(shell hg tip --template '{node|short}')
  buildid := $(date)-$(revid)
  buildid_short := $(date)
endif
ifeq ($(buildid),)
  $(warning Could not determine build id)
  $(warning Install hg or set WEAVE_BUILDID the checkout id)
  $(error)
endif

ifeq ($(MAKECMDGOALS),xpi)
  unpacked =\#
  jar=
  chrometarget=xpi
else
  unpacked=
  jar=\#
  chrometarget=
endif

ifeq ($(rebuild_crypto),)
  crypto_build_target =
else
  crypto_build_target = rebuild_all
endif

subst_names := \
  weave_version \
  compatible_version \
  weave_id \
  buildid \
  buildid_short \
  server_url \
  update_url \
  update_url_tag \
  unpacked \
  jar
export $(subst_names)
export substitute = perl -pe 's/@([^@]+)@/defined $$$$ENV{$$$$1} ? $$$$ENV{$$$$1} : $$$$&/ge'

ifneq ($(findstring MINGW,$(shell uname -s)),)
  export NO_SYMLINK = 1
endif

all: build

.PHONY: setup chrome build test xpi clean $(xpi_files)

test: build
	$(MAKE) -k -C tests/unit

setup:
	mkdir -p $(objdir)
	mkdir -p $(stage_dir)
	mkdir -p $(xpi_dir)

crypto: setup
	$(MAKE) -C crypto $(crypto_build_target)

chrome: setup
	$(MAKE) -C source $(chrometarget)

build: crypto chrome

xpi_name := weave-$(weave_version)-$(xpi_type).xpi
xpi_files := chrome/sync.jar defaults components modules platform \
             install.rdf chrome.manifest

xpi: build
	rm -f $(xpi_dir)/$(xpi_name)
	cd $(stage_dir);zip -9r $(xpi_name) $(xpi_files)
	mv $(stage_dir)/$(xpi_name) $(xpi_dir)/$(xpi_name)

clean:
	rm -rf $(objdir)
	$(MAKE) -C tests/unit clean
	$(MAKE) -C crypto/src clean

help:
	@echo Targets:
	@echo build
	@echo "crypto (only updates the crypto directory)"
	@echo "chrome (only updates the source directory)"
	@echo "test (runs tests, runs a build first)"
	@echo "xpi (sets manifest to use jars, make build to undo)"
	@echo clean
	@echo
	@echo Variables:
	@echo sdkdir
	@echo "release_build (set to 1 when not building a snapshot)"
	@echo "rebuild_crypto (set to 1 when building a new crypto binary)"
	@echo "platform_target (takes a space-separated list of platforms to package):"
	@echo "    make xpi platform_target='Linux_x86-gcc3'"
	@echo "  this also supports * as a wildcard:"
	@echo "    make xpi platform_target='Linux_x86* WINNT* Darwin'"
	@echo
	@echo Substitutions for .in files:
	@echo $(subst_names)
