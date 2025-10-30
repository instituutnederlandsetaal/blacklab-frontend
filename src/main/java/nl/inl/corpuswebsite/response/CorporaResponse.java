package nl.inl.corpuswebsite.response;

import java.util.List;
import java.util.Optional;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import nl.inl.corpuswebsite.BaseResponse;
import nl.inl.corpuswebsite.MainServlet;

/** Show the list of available corpora. */
public class CorporaResponse extends BaseResponse {

    public CorporaResponse() {
        super("corpora", false);
    }

    @Override
    protected void completeRequest() {
        displayHtmlTemplate(servlet.getTemplate("corpora"));
    }
}
