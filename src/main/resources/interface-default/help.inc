## To override this file, create a dedicated help.inc file in the corpus's own directory.

<div>
	<div class="pull-right">
		<button class="btn btn-default" id="toggle-fullscreen" title="fullscreen"><span class="fa fa-arrows-alt"></span></button>
		<a class="btn btn-default" title="open in new window" target="_blank" href="$corpusPath/static/files/manual.pdf"><span class="fa fa-external-link"></span></a>
	</div>
	<h2>Manual</h2>
</div>

<object id="viewer" data="$corpusPath/static/files/manual.pdf" type="application/pdf">
	<div class="well" style="margin-top: 25px">
		<h4>
			<span class="fa fa-warning"></span> It appears your browser does not support viewing pdf files, please
			<a href="$corpusPath/static/files/manual.pdf" download="AutoSearch-manual.pdf">download</a>
			the manual to view it.
		</h4>
	</div>
</object>

<a href="$corpusPath/static/files/manual.pdf" download="AutoSearch-manual.pdf" class="btn btn-primary" style="margin-top: 25px"><span class="fa fa-download fa-lg"></span> Download</a>

<script lang="text/javascript">
	(function() {
	    var viewer = document.getElementById('viewer');
	    var button = document.getElementById('toggle-fullscreen');

	    function toggle() {
	        button.classList.toggle('fullscreen');
	        viewer.classList.toggle('fullscreen');
	    }

	    function handleEscape(event) {
	        if (event.keyCode === 27) {
	            button.classList.remove('fullscreen');
	            viewer.classList.remove('fullscreen');
	            event.preventDefault();
	            event.stopPropagation();
	        }
	    }

	    button.onclick = toggle;

	    document.onkeyup = handleEscape;
	    viewer.onkeyup = handleEscape;
	})()
</script>

<style>
	body {
		padding-top: 50px !important;
	}

	#viewer:not(.fullscreen) {
		width: 100%;
		height: calc(100vh - 250px);
	}

	#viewer.fullscreen {
		position: fixed;
		z-index: 5000;
		left: 0;
		top: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		height: 100%;
	}

	#toggle-fullscreen.fullscreen {
		position: fixed;
		right: 50px;
		top: 50px;
		z-index: 5001;
	}
</style>
