package nl.inl.corpuswebsite.response;

import java.io.IOException;

import jakarta.servlet.http.HttpServletResponse;

import nl.inl.corpuswebsite.BaseResponse;

/** Show an error page. */
public class ErrorResponse extends BaseResponse {

    public ErrorResponse() {
        super("error", false);
    }

    @Override
    protected void completeRequest() {
        model.put("error", "Response for '" + request.getRequestURI() + "' not found");

        try {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
        // displayHtmlTemplate(servlet.getTemplate("error"));
    }

}
