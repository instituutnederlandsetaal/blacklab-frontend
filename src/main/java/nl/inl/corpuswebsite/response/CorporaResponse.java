package nl.inl.corpuswebsite.response;

import nl.inl.corpuswebsite.BaseResponse;

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
