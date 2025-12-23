package nl.inl.corpuswebsite.response;

import java.io.File;
import java.io.IOException;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;

import javax.servlet.http.HttpServletResponse;

import nl.inl.corpuswebsite.BaseResponse;
import nl.inl.corpuswebsite.utils.StaticFileHandler;

public class CorporaDataResponse extends BaseResponse {

    public CorporaDataResponse() {
        super("data", false); // allow getting static files without corpus, this normally never happens, but we clear the corpus for /default/ static files
    }

    @Override
    protected void completeRequest() throws IOException {
        try {
            // NOTE: the corpus-specific directory can be used to store both internal and external files.
            // Internal files should be located in the root directory for the corpus interface-data directory
            // while external files (those available through the browser) should be located in the 'static' subdirectory.
            // This is why we begin with the 'static' directory
            Path path = Paths.get("./static");
            for (String s : pathParameters) {
                path = path.resolve(s);
            }

            String pathString = path.toString();
            Optional<File> file = servlet.getProjectFile(corpus, pathString);

            if (!file.isPresent() || !file.get().isFile()) {
                response.setStatus(404);
                return;
            }

            String mime = servlet.getServletContext().getMimeType(pathString);
            StaticFileHandler.serveFile(request, response, file.get(), mime);
        } catch (InvalidPathException e1) { // runtimeException from Path.resolve; when weird paths are being requested
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
    }
}
